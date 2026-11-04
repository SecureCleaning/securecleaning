-- Conflicting client details must not discard an unconfirmed appointment request.
-- Keep the email uniqueness constraint and existing clients/assignments intact.
-- Only alternate-time requests can be retained without an automatic CRM link.
ALTER TABLE public.partner_booking_requests
 ADD COLUMN contact_review_required boolean NOT NULL DEFAULT false;
CREATE INDEX partner_request_contact_review_queue
 ON public.partner_booking_requests(assigned_assignee_id,created_at)
 WHERE contact_review_required;

-- Production requires a client for every ordinary booking. Retain that rule,
-- allowing only private, explicitly flagged requests to await identity review.
-- The client foreign key (including ON DELETE RESTRICT) stays in place.
ALTER TABLE public.bookings ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_client_or_partner_request
 CHECK (client_id IS NOT NULL OR partner_request_id IS NOT NULL);

CREATE FUNCTION public.guard_partner_contact_review_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r partner_booking_requests%ROWTYPE;
BEGIN
 IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.client_id IS NOT NULL THEN
   RAISE EXCEPTION 'An identified booking cannot be detached from its client' USING ERRCODE='23514';
 END IF;
 SELECT * INTO r FROM partner_booking_requests WHERE id=NEW.partner_request_id FOR SHARE;
 IF r.id IS NULL OR r.request_kind <> 'request' OR NOT r.contact_review_required
   OR (r.booking_id IS NOT NULL AND r.booking_id <> NEW.id)
   OR (TG_OP = 'UPDATE' AND r.booking_id IS DISTINCT FROM NEW.id)
   OR NEW.quote_id IS NOT NULL OR NEW.site_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL THEN
   RAISE EXCEPTION 'An unlinked booking requires a contact-review appointment request' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_partner_contact_review_booking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_partner_contact_review_booking() TO service_role;
CREATE TRIGGER partner_contact_review_booking BEFORE INSERT OR UPDATE ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.guard_partner_contact_review_booking();

-- A pending request is inserted first, then linked to its booking in the same
-- transaction. Afterwards its review flag/link cannot be cleared prematurely.
CREATE FUNCTION public.guard_partner_contact_review_request()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE unlinked_booking uuid;
BEGIN
 SELECT id INTO unlinked_booking FROM bookings WHERE partner_request_id=OLD.id AND client_id IS NULL;
 IF unlinked_booking IS NOT NULL AND (NOT NEW.contact_review_required OR NEW.request_kind <> 'request'
   OR NEW.booking_id IS DISTINCT FROM unlinked_booking) THEN
   RAISE EXCEPTION 'Resolve the booking client before clearing contact review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_partner_contact_review_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_partner_contact_review_request() TO service_role;
CREATE TRIGGER partner_contact_review_request BEFORE UPDATE OF contact_review_required, request_kind, booking_id ON public.partner_booking_requests
 FOR EACH ROW EXECUTE FUNCTION public.guard_partner_contact_review_request();

CREATE OR REPLACE FUNCTION public.create_partner_booking(p_user_id uuid, p_session_version uuid, p_request_id uuid, p_input_hash text, p_inputs jsonb, p_start timestamptz, p_config text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE u partner_booking_users%ROWTYPE; c partner_booking_companies%ROWTYPE; r partner_booking_requests%ROWTYPE;
 config_text text; profile jsonb; contact_id uuid; v_booking_id uuid; booking_ref text; staff_id uuid; opportunity_id uuid; matches integer; contact_review boolean := false; is_request boolean := p_inputs->>'inspectionBookingSource' = 'partner_request'; candidate jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(617204, 1);
 SELECT * INTO u FROM partner_booking_users WHERE id = p_user_id FOR SHARE;
 SELECT * INTO c FROM partner_booking_companies WHERE id = u.company_id FOR SHARE;
 IF u.id IS NULL OR NOT u.active OR u.session_version <> p_session_version OR NOT c.active OR (c.expires_at IS NOT NULL AND c.expires_at <= now()) THEN
   RAISE EXCEPTION 'Partner access revoked' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO r FROM partner_booking_requests WHERE id = p_request_id;
 IF r.id IS NOT NULL THEN
   IF r.user_id <> u.id OR r.input_hash <> p_input_hash THEN RAISE EXCEPTION 'Booking request conflict' USING ERRCODE = '23514'; END IF;
   RETURN jsonb_build_object('created',false,'bookingRef',(SELECT b.booking_ref FROM bookings b WHERE b.id = r.booking_id));
 END IF;
 IF NOT (p_inputs->>'city' = ANY(c.cities)) OR NOT (p_inputs->>'preferredInspectionAssigneeId' = ANY(c.assignee_ids)) THEN RAISE EXCEPTION 'Calendar not permitted' USING ERRCODE = '42501'; END IF;
 SELECT content INTO config_text FROM availability_private_config WHERE key = 'availability.config' FOR SHARE;
 IF config_text IS DISTINCT FROM p_config THEN RAISE EXCEPTION 'Availability changed; refresh before booking' USING ERRCODE = '23P01'; END IF;
 SELECT value INTO profile FROM jsonb_array_elements(config_text::jsonb->'assignees') WHERE value->>'id' = p_inputs->>'preferredInspectionAssigneeId';
 IF profile IS NULL OR profile->>'active' <> 'true' OR profile->>'city' <> p_inputs->>'city' OR (p_start IS NULL AND NOT COALESCE(is_request,false)) OR p_start <= now() OR p_start > now() + interval '92 days' THEN RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '23514'; END IF;
 IF is_request THEN
   IF p_start IS NOT NULL OR jsonb_typeof(p_inputs->'requestedInspectionTimes') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_inputs->'requestedInspectionTimes') NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid proposed times' USING ERRCODE='23514'; END IF;
   FOR candidate IN SELECT value FROM jsonb_array_elements(p_inputs->'requestedInspectionTimes') LOOP
     IF candidate->>'date' !~ '^\d{4}-\d{2}-\d{2}$' OR candidate->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR candidate->>'startTime' > '23:50' OR extract(isodow FROM (candidate->>'date')::date) > 5
       OR (candidate->>'date')::date <= (now() AT TIME ZONE CASE WHEN p_inputs->>'city'='brisbane' THEN 'Australia/Brisbane' ELSE 'Australia/Sydney' END)::date
       OR (candidate->>'date')::date > (now() AT TIME ZONE CASE WHEN p_inputs->>'city'='brisbane' THEN 'Australia/Brisbane' ELSE 'Australia/Sydney' END)::date + 90
       OR candidate->>'date' IS NULL OR candidate->>'startTime' IS NULL THEN RAISE EXCEPTION 'Invalid proposed time' USING ERRCODE='23514'; END IF;
   END LOOP;
 END IF;
 -- Exact contact matching only. Never overwrite an existing person's details.
 SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO matches, contact_id FROM clients WHERE lower(trim(email)) = lower(trim(p_inputs->>'email'))
 AND lower(trim(business_name)) = lower(trim(p_inputs->>'businessName'))
 AND lower(trim(contact_name)) = lower(trim(p_inputs->>'contactName')) AND city::text = p_inputs->>'city'
 AND regexp_replace(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),'^61','0') = regexp_replace(regexp_replace(COALESCE(p_inputs->>'phone',''),'[^0-9]','','g'),'^61','0');
 IF matches > 1 OR (matches = 0 AND EXISTS(SELECT 1 FROM clients WHERE lower(trim(email)) = lower(trim(p_inputs->>'email')))) THEN
   IF NOT COALESCE(is_request,false) THEN
     RAISE EXCEPTION 'Contact reconciliation required' USING ERRCODE = '23514';
   END IF;
   -- Retain the submitted snapshot for review; never attach it to a different
   -- business just because an email matches. The appointment is still only TBA.
   contact_id := NULL;
   contact_review := true;
 END IF;
 IF contact_id IS NULL AND NOT contact_review THEN
   INSERT INTO clients(business_name, contact_name, email, phone, address, city) VALUES
   (p_inputs->>'businessName', p_inputs->>'contactName', p_inputs->>'email', p_inputs->>'phone', p_inputs->>'address', (p_inputs->>'city')::city_type) RETURNING id INTO contact_id;
 END IF;
 INSERT INTO partner_booking_requests(id,user_id,company_id,input_hash,request_kind,proposed_times,assigned_assignee_id,decision_status,contact_review_required) VALUES(p_request_id,u.id,c.id,p_input_hash,CASE WHEN is_request THEN 'request' ELSE 'booking' END,CASE WHEN is_request THEN p_inputs->'requestedInspectionTimes' ELSE '[]'::jsonb END,profile->>'id',CASE WHEN is_request THEN 'pending' ELSE 'confirmed' END,contact_review);
 booking_ref := 'BK-' || to_char(now(),'YYYYMMDD') || '-' || upper(replace(p_request_id::text,'-',''));
 INSERT INTO bookings(booking_ref, client_id, inputs, status, inspection_status, inspection_scheduled_for, assigned_operator_id, partner_request_id)
 VALUES(booking_ref, contact_id, p_inputs, 'pending', CASE WHEN is_request THEN 'pending' ELSE 'scheduled' END, p_start, NULLIF(profile->>'ownerOperatorId','')::uuid, p_request_id) RETURNING id INTO v_booking_id;
 SELECT id INTO staff_id FROM admin_staff_accounts WHERE active AND role::text = 'agent' AND availability_assignee_id = profile->>'id' ORDER BY id LIMIT 1;
 IF NOT contact_review THEN
 opportunity_id := sync_client_crm_opportunity(NULL, v_booking_id, contact_id, NULL,
 p_inputs->>'address', p_inputs->>'suburb', p_inputs->>'postcode', (p_inputs->>'city')::city_type,
 'direct_booking', CASE WHEN is_request THEN 'Unconfirmed appointment requested through telemarketing partner: ' ELSE 'Appointment agreed by customer through telemarketing partner: ' END || c.name, staff_id, CASE WHEN staff_id IS NULL THEN 'unassigned' ELSE 'booking_assignee' END);
 ELSE
   INSERT INTO crm_reconciliation_issues(record_type,record_id,issue_code,details)
   VALUES('booking',v_booking_id,'partner_contact_review',jsonb_build_object('requestId',p_request_id));
 END IF;
 -- The existing sync routine preserves established client assignments.
 UPDATE partner_booking_requests SET booking_id = v_booking_id WHERE id = p_request_id;
 INSERT INTO admin_audit_log(entity_type, entity_ref, action, details) VALUES('booking', booking_ref, CASE WHEN is_request THEN 'partner.appointment.requested' ELSE 'partner.appointment.created' END, jsonb_build_object('companyId',c.id,'companyName',c.name,'partnerUserId',u.id,'caller',u.display_name,'opportunityId',opportunity_id,'contactReviewRequired',contact_review));
 RETURN jsonb_build_object('created',true,'bookingRef',booking_ref,'bookingId',v_booking_id,'contactReviewRequired',contact_review);
END $$;
REVOKE ALL ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) TO service_role;
