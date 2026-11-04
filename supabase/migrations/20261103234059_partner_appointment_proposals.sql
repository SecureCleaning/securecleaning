-- Proposed times are not calendar reservations. Existing bookings remain unchanged.
ALTER TABLE public.partner_booking_requests
 ADD COLUMN request_kind text NOT NULL DEFAULT 'booking' CHECK(request_kind IN ('booking','request')),
 ADD COLUMN proposed_times jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN assigned_assignee_id text,
 ADD COLUMN decision_status text NOT NULL DEFAULT 'confirmed' CHECK(decision_status IN ('pending','confirmed','declined')),
 ADD COLUMN selected_proposal integer,
 ADD COLUMN decided_by text,
 ADD COLUMN decided_at timestamptz,
 ADD COLUMN decision_reason text,
 ADD COLUMN decision_email_status text NOT NULL DEFAULT 'not_required' CHECK(decision_email_status IN ('not_required','sending','sent','review_required')),
 ADD COLUMN decision_calendar_status text NOT NULL DEFAULT 'not_required' CHECK(decision_calendar_status IN ('not_required','sending','sent','internal','review_required'));
CREATE INDEX partner_request_review_queue ON public.partner_booking_requests(assigned_assignee_id, decision_status, created_at) WHERE request_kind='request';

CREATE OR REPLACE FUNCTION public.create_partner_booking(p_user_id uuid, p_session_version uuid, p_request_id uuid, p_input_hash text, p_inputs jsonb, p_start timestamptz, p_config text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE u partner_booking_users%ROWTYPE; c partner_booking_companies%ROWTYPE; r partner_booking_requests%ROWTYPE;
 config_text text; profile jsonb; contact_id uuid; v_booking_id uuid; booking_ref text; staff_id uuid; opportunity_id uuid; matches integer; is_request boolean := p_inputs->>'inspectionBookingSource' = 'partner_request'; candidate jsonb;
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
   RAISE EXCEPTION 'Contact reconciliation required' USING ERRCODE = '23514';
 END IF;
 IF contact_id IS NULL THEN
   INSERT INTO clients(business_name, contact_name, email, phone, address, city) VALUES
   (p_inputs->>'businessName', p_inputs->>'contactName', p_inputs->>'email', p_inputs->>'phone', p_inputs->>'address', (p_inputs->>'city')::city_type) RETURNING id INTO contact_id;
 END IF;
 INSERT INTO partner_booking_requests(id,user_id,company_id,input_hash,request_kind,proposed_times,assigned_assignee_id,decision_status) VALUES(p_request_id,u.id,c.id,p_input_hash,CASE WHEN is_request THEN 'request' ELSE 'booking' END,CASE WHEN is_request THEN p_inputs->'requestedInspectionTimes' ELSE '[]'::jsonb END,profile->>'id',CASE WHEN is_request THEN 'pending' ELSE 'confirmed' END);
 booking_ref := 'BK-' || to_char(now(),'YYYYMMDD') || '-' || upper(replace(p_request_id::text,'-',''));
 INSERT INTO bookings(booking_ref, client_id, inputs, status, inspection_status, inspection_scheduled_for, assigned_operator_id, partner_request_id)
 VALUES(booking_ref, contact_id, p_inputs, 'pending', CASE WHEN is_request THEN 'pending' ELSE 'scheduled' END, p_start, NULLIF(profile->>'ownerOperatorId','')::uuid, p_request_id) RETURNING id INTO v_booking_id;
 SELECT id INTO staff_id FROM admin_staff_accounts WHERE active AND role::text = 'agent' AND availability_assignee_id = profile->>'id' ORDER BY id LIMIT 1;
 opportunity_id := sync_client_crm_opportunity(NULL, v_booking_id, contact_id, NULL,
 p_inputs->>'address', p_inputs->>'suburb', p_inputs->>'postcode', (p_inputs->>'city')::city_type,
 'direct_booking', CASE WHEN is_request THEN 'Unconfirmed appointment requested through telemarketing partner: ' ELSE 'Appointment agreed by customer through telemarketing partner: ' END || c.name, staff_id, CASE WHEN staff_id IS NULL THEN 'unassigned' ELSE 'booking_assignee' END);
 -- The existing sync routine preserves established client assignments.
 UPDATE partner_booking_requests SET booking_id = v_booking_id WHERE id = p_request_id;
 INSERT INTO admin_audit_log(entity_type, entity_ref, action, details) VALUES('booking', booking_ref, CASE WHEN is_request THEN 'partner.appointment.requested' ELSE 'partner.appointment.created' END, jsonb_build_object('companyId',c.id,'companyName',c.name,'partnerUserId',u.id,'caller',u.display_name,'opportunityId',opportunity_id));
 RETURN jsonb_build_object('created',true,'bookingRef',booking_ref,'bookingId',v_booking_id);
END $$;
REVOKE ALL ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) TO service_role;

-- All confirmations go through the reviewed decision path, including old dispatch screens.
CREATE FUNCTION public.guard_pending_partner_proposal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.partner_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM partner_booking_requests r WHERE r.id=NEW.partner_request_id AND r.request_kind='request' AND r.decision_status='pending')
 AND (NEW.inspection_scheduled_for IS NOT NULL OR NEW.status::text <> 'pending' OR NEW.inspection_status IS DISTINCT FROM 'pending'
 OR NEW.inputs IS DISTINCT FROM OLD.inputs OR NEW.assigned_operator_id IS DISTINCT FROM OLD.assigned_operator_id) THEN
 RAISE EXCEPTION 'Review the pending partner appointment request first' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pending_partner_proposal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_pending_partner_proposal() TO service_role;
CREATE TRIGGER pending_partner_proposal BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_pending_partner_proposal();

CREATE FUNCTION public.decide_partner_appointment_request(p_id uuid, p_assignee_id text, p_actor text, p_decision text, p_selected integer, p_reason text, p_config text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r partner_booking_requests%ROWTYPE; b bookings%ROWTYPE; proposal jsonb; profile jsonb; content_text text; start_at timestamptz; zone text; next_inputs jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(617204,1);
 SELECT * INTO r FROM partner_booking_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.request_kind <> 'request' OR r.assigned_assignee_id IS DISTINCT FROM p_assignee_id THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM bookings WHERE id=r.booking_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Booking removed' USING ERRCODE='23514'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('confirmed','declined') OR length(trim(COALESCE(p_actor,'')))=0 THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='23514'; END IF;
 IF r.decision_status <> 'pending' THEN
   IF r.decision_status=p_decision AND r.selected_proposal IS NOT DISTINCT FROM p_selected THEN RETURN jsonb_build_object('created',false,'bookingRef',b.booking_ref,'inputs',b.inputs); END IF;
   RAISE EXCEPTION 'Request already reviewed' USING ERRCODE='23514';
 END IF;
 IF r.email_status IN ('queued','sending') THEN RAISE EXCEPTION 'Initial notification is still being processed' USING ERRCODE='23514'; END IF;
 IF b.status::text <> 'pending' OR b.inspection_scheduled_for IS NOT NULL THEN RAISE EXCEPTION 'Booking already changed' USING ERRCODE='23514'; END IF;
 SELECT content INTO content_text FROM availability_private_config WHERE key='availability.config' FOR SHARE;
 IF content_text IS DISTINCT FROM p_config THEN RAISE EXCEPTION 'Availability changed' USING ERRCODE='23P01'; END IF;
 SELECT value INTO profile FROM jsonb_array_elements(content_text::jsonb->'assignees') WHERE value->>'id'=p_assignee_id;
 IF p_decision='confirmed' THEN
   IF profile IS NULL OR profile->>'active' <> 'true' OR profile->>'city' IS DISTINCT FROM b.inputs->>'city'
    OR p_selected IS NULL OR p_selected < 0 OR p_selected >= jsonb_array_length(r.proposed_times) THEN RAISE EXCEPTION 'Invalid proposed appointment' USING ERRCODE='23514'; END IF;
   proposal := r.proposed_times->p_selected;
   zone := CASE WHEN b.inputs->>'city'='brisbane' THEN 'Australia/Brisbane' ELSE 'Australia/Sydney' END;
   start_at := ((proposal->>'date') || ' ' || (proposal->>'startTime'))::timestamp AT TIME ZONE zone;
   IF start_at <= now() THEN RAISE EXCEPTION 'Proposed time has passed' USING ERRCODE='23514'; END IF;
   next_inputs := b.inputs || jsonb_build_object('preferredStartDate',proposal->>'date','preferredInspectionStartTime',proposal->>'startTime',
    'preferredInspectionEndTime',to_char((proposal->>'startTime')::time+interval '10 minutes','HH24:MI'),
    'preferredInspectionSlotLabel',(proposal->>'date') || ' ' || (proposal->>'startTime'),
    'preferredInspectionAssigneeName',profile->>'name','preferredInspectionCalendarId',profile->>'calendarId',
    'inspectionBookingSource','partner','inspectionAvailabilityOverridden',true,'inspectionDurationMinutes',10);
 ELSE
   IF p_selected IS NOT NULL OR length(trim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Enter a decline reason' USING ERRCODE='23514'; END IF;
   next_inputs := b.inputs;
 END IF;
 -- Change the request first, within the same transaction, so the booking guard permits this reviewed transition.
 UPDATE partner_booking_requests SET decision_status=p_decision,selected_proposal=p_selected,decided_by=p_actor,decided_at=now(),decision_reason=p_reason,
 decision_email_status='sending',decision_calendar_status=CASE WHEN p_decision='confirmed' THEN 'sending' ELSE 'not_required' END WHERE id=p_id;
 UPDATE bookings SET inputs=next_inputs,inspection_scheduled_for=start_at,inspection_status=CASE WHEN p_decision='confirmed' THEN 'scheduled' ELSE 'cancelled' END WHERE id=b.id;
 IF p_decision='declined' THEN UPDATE bookings SET status='cancelled' WHERE id=b.id; END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('booking',b.booking_ref,'partner.request.' || p_decision,jsonb_build_object('requestId',p_id,'actor',p_actor,'selectedProposal',p_selected,'reason',p_reason));
 RETURN jsonb_build_object('created',true,'bookingRef',b.booking_ref,'inputs',next_inputs);
END $$;
REVOKE ALL ON FUNCTION public.decide_partner_appointment_request(uuid,text,text,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_partner_appointment_request(uuid,text,text,text,integer,text,text) TO service_role;
