-- Apply before the app. No email/calendar actions. Existing contact-review rules remain unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION sync_client_crm_opportunity(
  p_quote_id UUID,
  p_booking_id UUID,
  p_contact_id UUID,
  p_site_id UUID,
  p_address TEXT,
  p_suburb TEXT,
  p_postcode TEXT,
  p_city city_type,
  p_source TEXT,
  p_source_explanation TEXT,
  p_assigned_staff_id UUID,
  p_assignment_method TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_company text;
  contact_row clients%ROWTYPE;
  resolved_organisation_id UUID;
  resolved_site_id UUID;
  resolved_site_key TEXT;
  resolved_opportunity_id UUID;
  resolved_intake_id UUID;
  resolved_sequence INTEGER;
  resolved_cycle INTEGER;
  previous_opportunity_id UUID;
  resolved_reference TEXT;
  quote_opportunity_id UUID;
  booking_opportunity_id UUID;
BEGIN
  IF p_quote_id IS NULL AND p_booking_id IS NULL THEN
    RAISE EXCEPTION 'quote or booking reference is required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO contact_row FROM clients WHERE id = p_contact_id FOR UPDATE;
  IF contact_row.id IS NULL THEN RAISE EXCEPTION 'contact not found' USING ERRCODE = '23503'; END IF;

  resolved_organisation_id := contact_row.organisation_id;
  IF resolved_organisation_id IS NULL THEN
    INSERT INTO crm_organisations(business_name, phone)
    VALUES (contact_row.business_name, contact_row.phone)
    RETURNING id INTO resolved_organisation_id;
    UPDATE clients SET organisation_id = resolved_organisation_id WHERE id = contact_row.id;
  END IF;

  IF p_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quotes
    WHERE id = p_quote_id AND client_id = contact_row.id
  ) THEN
    RAISE EXCEPTION 'quote does not belong to contact' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crm-org:' || resolved_organisation_id::TEXT, 0));

  IF p_site_id IS NOT NULL THEN
    SELECT (details->>'canonicalSiteId')::UUID INTO resolved_site_id
    FROM crm_reconciliation_issues
    WHERE record_type = 'site'
      AND record_id = p_site_id
      AND issue_code = 'duplicate_site_identity'
      AND resolved_at IS NULL;
    resolved_site_id := COALESCE(resolved_site_id, p_site_id);
    SELECT id INTO resolved_site_id
    FROM sites
    WHERE id = resolved_site_id
      AND (organisation_id = resolved_organisation_id OR organisation_id IS NULL)
      AND is_active = TRUE
    FOR UPDATE;
    IF resolved_site_id IS NULL THEN RAISE EXCEPTION 'site does not belong to contact organisation' USING ERRCODE = '23514'; END IF;
    UPDATE sites SET
      organisation_id = resolved_organisation_id,
      crm_site_key = COALESCE(crm_site_key, crm_site_identity_key(address, suburb, postcode, city))
    WHERE id = resolved_site_id;
  ELSE
    resolved_site_key := crm_site_identity_key(p_address, p_suburb, p_postcode, p_city);
    IF resolved_site_key IS NOT NULL THEN
      SELECT id INTO resolved_site_id
      FROM sites
      WHERE organisation_id = resolved_organisation_id AND crm_site_key = resolved_site_key;
      IF resolved_site_id IS NULL THEN
        INSERT INTO sites(
          client_id, organisation_id, site_name, address, suburb, postcode, city,
          is_active, crm_site_key
        ) VALUES (
          contact_row.id, resolved_organisation_id, contact_row.business_name,
          BTRIM(p_address), NULLIF(BTRIM(p_suburb), ''),
          regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g'), p_city, TRUE, resolved_site_key
        )
        ON CONFLICT (organisation_id, crm_site_key)
          WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL
        DO UPDATE SET crm_site_key = EXCLUDED.crm_site_key
        RETURNING id INTO resolved_site_id;
      END IF;
    END IF;
  END IF;

  IF resolved_site_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-site:' || resolved_site_id::TEXT, 0));
  END IF;

  IF p_quote_id IS NOT NULL THEN
    SELECT opportunity_id INTO quote_opportunity_id
    FROM crm_opportunity_quotes
    WHERE quote_id = p_quote_id;
    IF quote_opportunity_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM crm_opportunities
      WHERE id = quote_opportunity_id
        AND organisation_id = resolved_organisation_id
        AND primary_contact_id = contact_row.id
    ) THEN
      RAISE EXCEPTION 'quote opportunity does not belong to contact' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT opportunity_id INTO booking_opportunity_id
    FROM bookings
    WHERE id = p_booking_id
      AND client_id = contact_row.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking does not belong to contact' USING ERRCODE = '23514';
    END IF;
    IF booking_opportunity_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM crm_opportunities
      WHERE id = booking_opportunity_id
        AND organisation_id = resolved_organisation_id
        AND primary_contact_id = contact_row.id
    ) THEN
      RAISE EXCEPTION 'booking opportunity does not belong to contact' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF quote_opportunity_id IS NOT NULL AND booking_opportunity_id IS NOT NULL
    AND quote_opportunity_id <> booking_opportunity_id THEN
    RAISE EXCEPTION 'quote and booking belong to different opportunities' USING ERRCODE = '23514';
  END IF;
  resolved_opportunity_id := COALESCE(quote_opportunity_id, booking_opportunity_id);

  IF resolved_opportunity_id IS NOT NULL AND resolved_site_id IS NOT NULL THEN
    resolved_opportunity_id := crm_promote_provisional_opportunity(resolved_opportunity_id, resolved_site_id);
  END IF;

  IF resolved_opportunity_id IS NULL THEN
    SELECT id INTO resolved_opportunity_id
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND closed_at IS NULL
      AND (
        (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
        OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = contact_row.id)
      )
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF resolved_opportunity_id IS NULL AND resolved_site_id IS NOT NULL THEN
    SELECT id INTO resolved_opportunity_id
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND primary_contact_id = contact_row.id
      AND site_id IS NULL
      AND closed_at IS NULL
    ORDER BY created_at, id
    LIMIT 1;
    IF resolved_opportunity_id IS NOT NULL THEN
      resolved_opportunity_id := crm_promote_provisional_opportunity(resolved_opportunity_id, resolved_site_id);
    END IF;
  END IF;

  IF resolved_opportunity_id IS NULL THEN
    SELECT id, cycle_number INTO previous_opportunity_id, resolved_cycle
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND (
        (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
        OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = contact_row.id)
      )
    ORDER BY cycle_number DESC, created_at DESC, id DESC
    LIMIT 1;
    INSERT INTO crm_opportunities(
      organisation_id, primary_contact_id, site_id, assigned_staff_id, stage,
      cycle_number, previous_opportunity_id, cycle_reason, assignment_method
    ) VALUES (
      resolved_organisation_id, contact_row.id, resolved_site_id, p_assigned_staff_id,
      'new',
      COALESCE(resolved_cycle, 0) + 1, previous_opportunity_id,
      CASE WHEN previous_opportunity_id IS NULL THEN 'new_enquiry' ELSE 'requote' END,
      p_assignment_method
    ) RETURNING id INTO resolved_opportunity_id;
  ELSE
    UPDATE crm_opportunities SET
      assigned_staff_id = COALESCE(assigned_staff_id, p_assigned_staff_id),
      assignment_method = CASE WHEN assigned_staff_id IS NULL AND p_assigned_staff_id IS NOT NULL THEN p_assignment_method ELSE assignment_method END,
      stage = stage
    WHERE id = resolved_opportunity_id;
  END IF;

  -- Derive provenance from the authenticated partner request, never browser fields.
  SELECT c.name INTO partner_company
  FROM bookings b JOIN partner_booking_requests r ON r.id=b.partner_request_id
  JOIN partner_booking_companies c ON c.id=r.company_id
  WHERE b.id=p_booking_id;
  IF partner_company IS NOT NULL THEN
    p_source := 'telemarketing_partner';
    p_source_explanation := 'Cleaning enquiry received through telemarketing partner: ' || partner_company;
    PERFORM advance_crm_lead_stage(resolved_opportunity_id,'contacted','telemarketing_request');
  END IF;
  resolved_reference := COALESCE(p_quote_id::TEXT, p_booking_id::TEXT);
  SELECT id INTO resolved_intake_id
  FROM leads
  WHERE source = p_source AND source_reference = resolved_reference;
  IF resolved_intake_id IS NULL THEN
    INSERT INTO leads(
      email, business_name, contact_name, phone, city, source, converted_to_client_id,
      organisation_id, contact_id, site_id, address, suburb, postcode, state,
      source_reference, source_explanation, source_obtained_at, contact_basis
    ) VALUES (
      LOWER(BTRIM(contact_row.email)), contact_row.business_name, contact_row.contact_name,
      contact_row.phone, p_city, p_source, contact_row.id, resolved_organisation_id,
      contact_row.id, resolved_site_id, NULLIF(BTRIM(p_address), ''), NULLIF(BTRIM(p_suburb), ''),
      NULLIF(regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g'), ''),
      CASE WHEN p_city = 'sydney' THEN 'NSW' WHEN p_city = 'brisbane' THEN 'QLD' ELSE 'VIC' END,
      resolved_reference, p_source_explanation, NOW(), 'enquiry'
    ) RETURNING id INTO resolved_intake_id;
  END IF;
  IF partner_company IS NOT NULL THEN
    UPDATE leads SET source_provider=partner_company WHERE id=resolved_intake_id;
  END IF;
  INSERT INTO crm_opportunity_intakes(opportunity_id, lead_id)
  VALUES (resolved_opportunity_id, resolved_intake_id)
  ON CONFLICT (lead_id) DO NOTHING;

  IF p_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity_quotes WHERE quote_id = p_quote_id
  ) THEN
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO resolved_sequence
    FROM crm_opportunity_quotes WHERE opportunity_id = resolved_opportunity_id;
    INSERT INTO crm_opportunity_quotes(opportunity_id, quote_id, sequence_number, link_source)
    VALUES (resolved_opportunity_id, p_quote_id, resolved_sequence, p_source)
    ON CONFLICT (quote_id) DO NOTHING;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    UPDATE bookings SET opportunity_id = resolved_opportunity_id
    WHERE id = p_booking_id AND opportunity_id IS NULL;
  END IF;
  RETURN resolved_opportunity_id;
END;
$$;


REVOKE ALL ON FUNCTION public.sync_client_crm_opportunity(uuid,uuid,uuid,uuid,text,text,text,city_type,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_crm_opportunity(uuid,uuid,uuid,uuid,text,text,text,city_type,text,text,uuid,text) TO service_role;
-- Only relabel intake records tied to verified partner bookings. Preserve all
-- customer/site identity, permissions, notes and other acquisition sources.
UPDATE public.leads l SET source='telemarketing_partner', source_provider=c.name,
 source_explanation='Cleaning enquiry received through telemarketing partner: ' || c.name
FROM public.bookings b JOIN public.partner_booking_requests r ON r.id=b.partner_request_id
JOIN public.partner_booking_companies c ON c.id=r.company_id
WHERE l.source_reference=b.id::text AND l.source='direct_booking'
 AND NOT EXISTS (SELECT 1 FROM public.leads other WHERE other.source='telemarketing_partner' AND other.source_reference=l.source_reference);
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT DISTINCT b.opportunity_id FROM public.bookings b
 JOIN public.partner_booking_requests r ON r.id=b.partner_request_id
 WHERE b.opportunity_id IS NOT NULL LOOP
  PERFORM public.advance_crm_lead_stage(item.opportunity_id,'contacted','telemarketing_request');
 END LOOP;
END $$;
COMMIT;
