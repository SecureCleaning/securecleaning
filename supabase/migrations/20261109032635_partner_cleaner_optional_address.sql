-- Preserve partner intake permissions, duplicate protection and delivery flow.
-- Save an optional street address into the existing cleaner record. No backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_partner_cleaner_intake(
 p_user_id uuid, p_session_version uuid, p_request_id uuid, p_input_hash text, p_inputs jsonb, p_service_areas text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 u partner_booking_users%ROWTYPE; c partner_booking_companies%ROWTYPE;
 r partner_cleaner_intakes%ROWTYPE; v_cleaner uuid; v_created boolean; v_reason text; v_status text;
 v_email text; v_state text; v_name text;
BEGIN
 -- Short transaction, never held during provider network calls. Serializes the
 -- hourly limit and duplicate submissions; the cleaner email index also covers other writers.
 PERFORM pg_advisory_xact_lock(617204, 2);
 SELECT * INTO u FROM partner_booking_users WHERE id = p_user_id FOR SHARE;
 SELECT * INTO c FROM partner_booking_companies WHERE id = u.company_id FOR SHARE;
 IF u.id IS NULL OR NOT u.active OR u.session_version IS DISTINCT FROM p_session_version OR NOT c.active
    OR (c.expires_at IS NOT NULL AND c.expires_at <= now())
    OR NOT COALESCE(p_inputs->>'city' = ANY(c.cities),false) THEN
   RAISE EXCEPTION 'Partner access revoked' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO r FROM partner_cleaner_intakes WHERE id = p_request_id;
 IF FOUND THEN
   IF r.user_id <> u.id OR r.input_hash IS DISTINCT FROM p_input_hash THEN
     RAISE EXCEPTION 'Submission conflict' USING ERRCODE = '23514';
   END IF;
   RETURN jsonb_build_object('created',false,'emailStatus',r.email_status);
 END IF;
 v_email := lower(btrim(p_inputs->>'email'));
 v_state := CASE p_inputs->>'city' WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' WHEN 'brisbane' THEN 'QLD' END;
 IF p_request_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
   OR p_inputs->'emailConsent' IS DISTINCT FROM 'true'::jsonb
   OR v_state IS NULL OR p_inputs->>'state' IS DISTINCT FROM v_state
   OR COALESCE(v_email,'') !~ '^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+\.[^[:space:]@<>,;]+$'
   OR length(v_email) > 254
   OR COALESCE(length(btrim(p_inputs->>'businessName')),0) NOT BETWEEN 1 AND 160
   OR COALESCE(length(btrim(p_inputs->>'firstName')),0) NOT BETWEEN 1 AND 80
   OR length(COALESCE(p_inputs->>'lastName','')) > 80
   OR length(COALESCE(p_inputs->>'address','')) > 240
   OR COALESCE(length(p_inputs->>'phone'),0) NOT BETWEEN 8 AND 40
   OR COALESCE(length(p_inputs->>'suburb'),0) NOT BETWEEN 1 AND 80
   OR COALESCE(p_inputs->>'postcode','') !~ '^[0-9]{4}$'
   OR length(COALESCE(p_inputs->>'notes','')) > 1500
   OR COALESCE(array_length(p_service_areas,1),0) <> 1
   OR p_service_areas[1] IS DISTINCT FROM left(p_inputs->>'suburb',72) || ' + 20 km' THEN
   RAISE EXCEPTION 'Invalid cleaner intake' USING ERRCODE = '23514';
 END IF;
 IF (SELECT count(*) FROM partner_cleaner_intakes WHERE user_id = u.id AND created_at > now() - interval '1 hour') >= 30 THEN
   RAISE EXCEPTION 'Hourly intake limit reached' USING ERRCODE = '54000';
 END IF;
 v_name := concat_ws(' ',p_inputs->>'firstName',nullif(p_inputs->>'lastName',''));
 INSERT INTO cleaners(business_name,first_name,last_name,contact_name,email,phone,address,suburb,postcode,city,state,status,compliance_status,service_areas)
 VALUES(p_inputs->>'businessName',p_inputs->>'firstName',p_inputs->>'lastName',v_name,v_email,p_inputs->>'phone',nullif(btrim(p_inputs->>'address'),''),p_inputs->>'suburb',p_inputs->>'postcode',p_inputs->>'city',v_state,'lead','not_checked',p_service_areas)
 ON CONFLICT (lower(email)) DO NOTHING RETURNING id INTO v_cleaner;
 v_created := v_cleaner IS NOT NULL;
 IF NOT v_created THEN
   SELECT id INTO v_cleaner FROM cleaners WHERE lower(email) = v_email;
   v_reason := 'An existing cleaner uses this email. Review the submitted details; no existing record was changed and no new email was sent.';
   v_status := 'review_required';
 ELSE
   v_status := 'queued';
   IF EXISTS(SELECT 1 FROM crm_email_suppressions WHERE email_normalized = v_email AND blocks_all)
     OR EXISTS(SELECT 1 FROM cleaner_broadcast_suppressions WHERE cleaner_id = v_cleaner OR email_normalized = v_email) THEN
     v_status := 'skipped'; v_reason := 'Email suppressed. Review existing communication preferences before contacting this cleaner.';
   END IF;
   INSERT INTO cleaner_comments(cleaner_id,author_name,comment) VALUES(v_cleaner,u.display_name || ' / ' || c.name,
     'Cleaner lead entered through the partner portal. Cleaner agreed to the profile-completion email.' || CASE WHEN COALESCE(p_inputs->>'notes','') = '' THEN '' ELSE E'\n\nInternal call notes: ' || (p_inputs->>'notes') END);
   INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('cleaner',v_cleaner::text,'cleaner.created',
     jsonb_build_object('actorId',u.id,'actorRole','partner','companyId',c.id,'requestId',p_request_id,'source','partner_portal'));
 END IF;
 INSERT INTO partner_cleaner_intakes(id,user_id,company_id,input_hash,inputs,cleaner_id,created_cleaner,review_reason,email_status)
 VALUES(p_request_id,u.id,c.id,p_input_hash,p_inputs,v_cleaner,v_created,v_reason,v_status);
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('partner_cleaner_intake',p_request_id::text,'partner.cleaner.submitted',
   jsonb_build_object('actorId',u.id,'companyId',c.id,'cleanerCreated',v_created,'emailStatus',v_status,'emailConsent',true));
 RETURN jsonb_build_object('created',true,'emailStatus',v_status);
END $$;

REVOKE ALL ON FUNCTION public.create_partner_cleaner_intake(uuid,uuid,uuid,text,jsonb,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_cleaner_intake(uuid,uuid,uuid,text,jsonb,text[]) TO service_role;
COMMIT;
