-- Apply before app. Preserve stored codes, closed cycles and win/product invariants.
BEGIN;
CREATE FUNCTION public.crm_lead_stage_rank(stage text) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT CASE stage WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'qualified' THEN 1
 WHEN 'inspection' THEN 2 WHEN 'quoting' THEN 3 WHEN 'proposal_sent' THEN 4 ELSE 100 END;
$$;
CREATE FUNCTION public.advance_crm_lead_stage(opportunity uuid, target text, reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE previous text;
BEGIN
 IF target IS NULL OR target NOT IN ('contacted','inspection','quoting','proposal_sent') THEN
   RAISE EXCEPTION 'Invalid automatic CRM stage';
 END IF;
 SELECT stage INTO previous FROM crm_opportunities WHERE id=opportunity FOR UPDATE;
 UPDATE crm_opportunities SET stage=target,updated_at=now()
 WHERE id=opportunity AND closed_at IS NULL AND stage NOT IN ('won','lost','cancelled')
   AND crm_lead_stage_rank(stage)<crm_lead_stage_rank(target);
 IF FOUND THEN
   INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
   VALUES('crm_opportunity',opportunity::text,'crm.stage.advanced',
     jsonb_build_object('from',previous,'to',target,'reason',reason));
 END IF;
END $$;
CREATE FUNCTION public.crm_lead_stage_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE link record; target text; quote_row record;
BEGIN
 IF TG_TABLE_NAME='crm_communications' THEN
   IF NEW.status='sent' AND NEW.sent_at IS NOT NULL THEN
     PERFORM advance_crm_lead_stage(NEW.opportunity_id,'contacted','outreach_sent');
   END IF;
 ELSIF TG_TABLE_NAME='bookings' THEN
   IF NEW.inspection_status='scheduled' AND NEW.inspection_scheduled_for IS NOT NULL
      AND NEW.status NOT IN ('cancelled') THEN
     PERFORM advance_crm_lead_stage(NEW.opportunity_id,'inspection','inspection_booked');
   END IF;
 ELSIF TG_TABLE_NAME='crm_opportunity_quotes' THEN
   SELECT * INTO quote_row FROM quotes WHERE id=NEW.quote_id;
   target := CASE WHEN quote_row.final_quote_sent_at IS NOT NULL THEN 'proposal_sent'
     WHEN NEW.link_source='crm_manual' OR coalesce(quote_row.firm_quote_workflow,'{}'::jsonb)<>'{}'::jsonb THEN 'quoting' ELSE NULL END;
   IF target IS NOT NULL THEN PERFORM advance_crm_lead_stage(NEW.opportunity_id,target,'quote_linked'); END IF;
 ELSIF TG_TABLE_NAME='quotes' THEN
   target := CASE WHEN NEW.final_quote_sent_at IS NOT NULL THEN 'proposal_sent'
     WHEN coalesce(NEW.firm_quote_workflow,'{}'::jsonb)<>'{}'::jsonb THEN 'quoting' ELSE NULL END;
   IF target IS NOT NULL THEN
     FOR link IN SELECT opportunity_id FROM crm_opportunity_quotes WHERE quote_id=NEW.id LOOP
       PERFORM advance_crm_lead_stage(link.opportunity_id,target,'quote_updated');
     END LOOP;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_contact_stage AFTER INSERT OR UPDATE OF status,sent_at ON public.crm_communications
 FOR EACH ROW EXECUTE FUNCTION crm_lead_stage_event();
CREATE TRIGGER crm_lead_inspection_stage AFTER INSERT OR UPDATE OF inspection_status,inspection_scheduled_for,opportunity_id ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION crm_lead_stage_event();
CREATE TRIGGER crm_lead_quote_link_stage AFTER INSERT ON public.crm_opportunity_quotes
 FOR EACH ROW EXECUTE FUNCTION crm_lead_stage_event();
CREATE TRIGGER crm_lead_quote_stage AFTER UPDATE OF final_quote_sent_at,firm_quote_workflow ON public.quotes
 FOR EACH ROW EXECUTE FUNCTION crm_lead_stage_event();
REVOKE ALL ON FUNCTION public.crm_lead_stage_rank(text), public.advance_crm_lead_stage(uuid,text,text),public.crm_lead_stage_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_lead_stage_rank(text), public.advance_crm_lead_stage(uuid,text,text),public.crm_lead_stage_event() TO service_role;
-- Receiving an inbound booking is not evidence of staff contact.
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
      CASE WHEN p_city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
      resolved_reference, p_source_explanation, NOW(), 'enquiry'
    ) RETURNING id INTO resolved_intake_id;
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

-- Reconcile open records using recorded successful events, never inferred contact from intake.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT DISTINCT opportunity_id FROM crm_communications WHERE status='sent' AND sent_at IS NOT NULL LOOP
   PERFORM advance_crm_lead_stage(item.opportunity_id,'contacted','existing_outreach');
 END LOOP;
 FOR item IN SELECT DISTINCT opportunity_id FROM bookings WHERE inspection_status='scheduled' AND inspection_scheduled_for IS NOT NULL AND status<>'cancelled' LOOP
   PERFORM advance_crm_lead_stage(item.opportunity_id,'inspection','existing_inspection');
 END LOOP;
 FOR item IN SELECT l.opportunity_id,q.final_quote_sent_at,l.link_source,q.firm_quote_workflow FROM crm_opportunity_quotes l JOIN quotes q ON q.id=l.quote_id LOOP
   IF item.final_quote_sent_at IS NOT NULL THEN
     PERFORM advance_crm_lead_stage(item.opportunity_id,'proposal_sent','existing_sent_quote');
   ELSIF item.link_source='crm_manual' OR coalesce(item.firm_quote_workflow,'{}'::jsonb)<>'{}'::jsonb THEN
     PERFORM advance_crm_lead_stage(item.opportunity_id,'quoting','existing_quote_draft');
   END IF;
 END LOOP;
END $$;
COMMIT;
