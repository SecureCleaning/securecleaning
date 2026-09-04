-- Secure Cleaning - structured CRM profile editing and append-only internal notes

CREATE TABLE IF NOT EXISTS crm_opportunity_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(BTRIM(body)) BETWEEN 1 AND 4000),
  author_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  author_name_snapshot TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'legacy_summary')),
  idempotency_key UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunity_notes_history
  ON crm_opportunity_notes(opportunity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunity_notes_legacy_summary
  ON crm_opportunity_notes(opportunity_id)
  WHERE source = 'legacy_summary';

ALTER TABLE crm_opportunity_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_opportunity_notes'
      AND policyname = 'Service role full access — crm_opportunity_notes'
  ) THEN
    CREATE POLICY "Service role full access — crm_opportunity_notes"
      ON crm_opportunity_notes FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON TABLE crm_opportunity_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE crm_opportunity_notes TO service_role;

INSERT INTO crm_opportunity_notes(
  opportunity_id, body, author_name_snapshot, source, created_at
)
SELECT id, BTRIM(notes), 'Imported CRM note', 'legacy_summary', created_at
FROM crm_opportunities
WHERE NULLIF(BTRIM(notes), '') IS NOT NULL
ON CONFLICT (opportunity_id) WHERE source = 'legacy_summary' DO NOTHING;

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
SET search_path = public
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  actor_row admin_staff_accounts%ROWTYPE;
  organisation_row crm_organisations%ROWTYPE;
  contact_row clients%ROWTYPE;
  site_row sites%ROWTYPE;
  resolved_contact_name TEXT;
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

  IF organisation_row.updated_at IS DISTINCT FROM p_expected_organisation_updated_at
    OR contact_row.updated_at IS DISTINCT FROM p_expected_contact_updated_at
    OR (site_row.id IS NOT NULL AND site_row.updated_at IS DISTINCT FROM p_expected_site_updated_at) THEN
    RAISE EXCEPTION 'client details changed since they were loaded' USING ERRCODE = '40001';
  END IF;

  resolved_contact_name := BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(p_first_name), ''), NULLIF(BTRIM(p_last_name), '')));
  IF NULLIF(BTRIM(p_business_name), '') IS NULL
    OR NULLIF(resolved_contact_name, '') IS NULL
    OR NULLIF(BTRIM(p_email), '') IS NULL
    OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (site_row.id IS NOT NULL AND (
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
  END IF;

  UPDATE crm_opportunities SET updated_at = NOW() WHERE id = opportunity_row.id;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('crm_opportunity', opportunity_row.id::TEXT, 'crm.profile.updated',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role,
      'entities', ARRAY['organisation', 'contact', CASE WHEN site_row.id IS NULL THEN NULL ELSE 'site' END]));
  RETURN opportunity_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION add_client_crm_note(
  p_opportunity_id UUID,
  p_body TEXT,
  p_idempotency_key UUID,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  actor_row admin_staff_accounts%ROWTYPE;
  existing_note crm_opportunity_notes%ROWTYPE;
  note_id UUID;
BEGIN
  SELECT * INTO actor_row FROM admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE AND role = p_actor_role;
  IF actor_row.id IS NULL OR p_actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'client CRM access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO opportunity_row FROM crm_opportunities WHERE id = p_opportunity_id;
  IF opportunity_row.id IS NULL
    OR (p_actor_role = 'agent' AND opportunity_row.assigned_staff_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'opportunity not found' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(BTRIM(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'invalid note' USING ERRCODE = '23514';
  END IF;

  INSERT INTO crm_opportunity_notes(
    opportunity_id, body, author_staff_id, author_name_snapshot, idempotency_key
  ) VALUES (
    p_opportunity_id, BTRIM(p_body), p_actor_id, actor_row.display_name, p_idempotency_key
  ) ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO note_id;
  IF note_id IS NULL THEN
    SELECT * INTO existing_note FROM crm_opportunity_notes
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF existing_note.id IS NULL
      OR existing_note.opportunity_id <> p_opportunity_id
      OR existing_note.author_staff_id <> p_actor_id THEN
      RAISE EXCEPTION 'note request conflict' USING ERRCODE = '23505';
    END IF;
    RETURN existing_note.id;
  END IF;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('crm_opportunity_note', note_id::TEXT, 'crm.note.added',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role, 'opportunityId', p_opportunity_id));
  RETURN note_id;
END;
$$;

REVOKE ALL ON FUNCTION update_client_crm_profile(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_client_crm_profile(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION add_client_crm_note(UUID, TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_client_crm_note(UUID, TEXT, UUID, UUID, TEXT)
  TO service_role;
