BEGIN;

CREATE OR REPLACE FUNCTION update_client_crm_profile(
  p_opportunity_id UUID,
  p_expected_opportunity_updated_at TIMESTAMPTZ,
  p_expected_organisation_updated_at TIMESTAMPTZ,
  p_expected_contact_updated_at TIMESTAMPTZ,
  p_expected_site_updated_at TIMESTAMPTZ,
  p_business_name TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_position_title TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_site_name TEXT,
  p_address TEXT,
  p_suburb TEXT,
  p_postcode TEXT,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  actor_row admin_staff_accounts%ROWTYPE;
  organisation_row crm_organisations%ROWTYPE;
  contact_row clients%ROWTYPE;
  site_row sites%ROWTYPE;
  resolved_contact_name TEXT;
  resolved_site_id UUID;
  resolved_site_key TEXT;
  resolved_opportunity_id UUID;
  has_site_input BOOLEAN;
BEGIN
  SELECT * INTO actor_row FROM admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE AND role = p_actor_role;
  IF actor_row.id IS NULL OR p_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'client CRM access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO opportunity_row FROM crm_opportunities
  WHERE id = p_opportunity_id FOR UPDATE;
  IF opportunity_row.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found' USING ERRCODE = 'P0002';
  END IF;
  IF opportunity_row.updated_at IS DISTINCT FROM p_expected_opportunity_updated_at THEN
    RAISE EXCEPTION 'opportunity changed since it was loaded' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO organisation_row FROM crm_organisations
  WHERE id = opportunity_row.organisation_id FOR UPDATE;
  SELECT * INTO contact_row FROM clients
  WHERE id = opportunity_row.primary_contact_id FOR UPDATE;
  IF opportunity_row.site_id IS NOT NULL THEN
    SELECT * INTO site_row FROM sites WHERE id = opportunity_row.site_id FOR UPDATE;
  END IF;

  IF organisation_row.id IS NULL OR contact_row.id IS NULL THEN
    RAISE EXCEPTION 'client CRM profile is incomplete' USING ERRCODE = '23514';
  END IF;
  IF organisation_row.updated_at IS DISTINCT FROM p_expected_organisation_updated_at
    OR contact_row.updated_at IS DISTINCT FROM p_expected_contact_updated_at
    OR (site_row.id IS NOT NULL AND site_row.updated_at IS DISTINCT FROM p_expected_site_updated_at) THEN
    RAISE EXCEPTION 'client details changed since they were loaded' USING ERRCODE = '40001';
  END IF;

  resolved_contact_name := BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(p_first_name), ''), NULLIF(BTRIM(p_last_name), '')));
  has_site_input := NULLIF(BTRIM(p_site_name), '') IS NOT NULL
    OR NULLIF(BTRIM(p_address), '') IS NOT NULL
    OR NULLIF(BTRIM(p_suburb), '') IS NOT NULL
    OR NULLIF(BTRIM(p_postcode), '') IS NOT NULL;
  IF NULLIF(BTRIM(p_business_name), '') IS NULL
    OR NULLIF(resolved_contact_name, '') IS NULL
    OR NULLIF(BTRIM(p_email), '') IS NULL
    OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR ((site_row.id IS NOT NULL OR has_site_input) AND (
      p_postcode !~ '^[0-9]{4}$'
      OR NULLIF(BTRIM(p_address), '') IS NULL
    )) THEN
    RAISE EXCEPTION 'invalid client CRM profile' USING ERRCODE = '23514';
  END IF;

  UPDATE crm_organisations SET
    business_name = BTRIM(p_business_name), updated_at = NOW()
  WHERE id = organisation_row.id;

  UPDATE clients SET
    business_name = BTRIM(p_business_name),
    first_name = NULLIF(BTRIM(p_first_name), ''),
    last_name = NULLIF(BTRIM(p_last_name), ''),
    contact_name = resolved_contact_name,
    position_title = NULLIF(BTRIM(p_position_title), ''),
    email = LOWER(BTRIM(p_email)),
    phone = NULLIF(BTRIM(p_phone), ''),
    updated_at = NOW()
  WHERE id = contact_row.id;

  IF site_row.id IS NOT NULL THEN
    UPDATE sites SET
      site_name = NULLIF(BTRIM(p_site_name), ''),
      address = BTRIM(p_address),
      suburb = NULLIF(BTRIM(p_suburb), ''),
      postcode = BTRIM(p_postcode),
      crm_site_key = crm_site_identity_key(BTRIM(p_address), BTRIM(p_suburb), BTRIM(p_postcode), site_row.city),
      updated_at = NOW()
    WHERE id = site_row.id;
    resolved_site_id := site_row.id;
  ELSIF has_site_input THEN
    IF contact_row.city IS NULL THEN
      RAISE EXCEPTION 'client city is required before adding a site' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-org:' || organisation_row.id::TEXT, 0));
    resolved_site_key := crm_site_identity_key(BTRIM(p_address), BTRIM(p_suburb), BTRIM(p_postcode), contact_row.city);
    INSERT INTO sites(
      client_id, organisation_id, site_name, address, suburb, postcode, city,
      is_active, crm_site_key, created_at, updated_at
    ) VALUES (
      contact_row.id, organisation_row.id,
      COALESCE(NULLIF(BTRIM(p_site_name), ''), BTRIM(p_business_name)),
      BTRIM(p_address), NULLIF(BTRIM(p_suburb), ''), BTRIM(p_postcode), contact_row.city,
      TRUE, resolved_site_key, NOW(), NOW()
    )
    ON CONFLICT (organisation_id, crm_site_key)
      WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL
    DO UPDATE SET crm_site_key = EXCLUDED.crm_site_key
    RETURNING id INTO resolved_site_id;
  END IF;

  resolved_opportunity_id := opportunity_row.id;
  IF opportunity_row.site_id IS NULL AND resolved_site_id IS NOT NULL THEN
    resolved_opportunity_id := crm_promote_provisional_opportunity(opportunity_row.id, resolved_site_id);
  END IF;
  UPDATE crm_opportunities SET updated_at = NOW() WHERE id = resolved_opportunity_id;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES (
    'crm_opportunity', resolved_opportunity_id::TEXT, 'crm.profile.updated',
    jsonb_build_object(
      'actorId', p_actor_id,
      'actorRole', p_actor_role,
      'entities', ARRAY['organisation', 'contact', CASE WHEN resolved_site_id IS NULL THEN NULL ELSE 'site' END]
    )
  );
  RETURN resolved_opportunity_id;
END;
$$;

REVOKE ALL ON FUNCTION update_client_crm_profile(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_client_crm_profile(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, TEXT
) TO service_role;

COMMIT;
