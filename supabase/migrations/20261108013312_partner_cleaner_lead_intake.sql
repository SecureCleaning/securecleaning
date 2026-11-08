-- Additive; apply before the partner cleaner-entry UI. Existing cleaners, bookings
-- and permissions are not modified. Internal functions are service-role only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.partner_cleaner_intakes (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.partner_booking_users(id),
 company_id uuid NOT NULL REFERENCES public.partner_booking_companies(id),
 input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
 inputs jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
 cleaner_id uuid REFERENCES public.cleaners(id) ON DELETE SET NULL,
 created_cleaner boolean NOT NULL,
 review_reason text,
 email_status text NOT NULL CHECK (email_status IN ('queued','sending','sent','failed','unknown','review_required','skipped')),
 email_id uuid REFERENCES public.cleaner_emails(id) ON DELETE SET NULL,
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_cleaner_intakes_created ON public.partner_cleaner_intakes(created_at DESC);
CREATE INDEX IF NOT EXISTS partner_cleaner_intakes_user_created ON public.partner_cleaner_intakes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_cleaner_intakes_cleaner ON public.partner_cleaner_intakes(cleaner_id);
CREATE INDEX IF NOT EXISTS partner_cleaner_intakes_company ON public.partner_cleaner_intakes(company_id);
CREATE INDEX IF NOT EXISTS partner_cleaner_intakes_email ON public.partner_cleaner_intakes(email_id);
ALTER TABLE public.partner_cleaner_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_cleaner_intakes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.partner_cleaner_intakes TO service_role;
DROP POLICY IF EXISTS partner_cleaner_intakes_service ON public.partner_cleaner_intakes;
CREATE POLICY partner_cleaner_intakes_service ON public.partner_cleaner_intakes FOR ALL TO service_role USING (true) WITH CHECK (true);

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
 INSERT INTO cleaners(business_name,first_name,last_name,contact_name,email,phone,suburb,postcode,city,state,status,compliance_status,service_areas)
 VALUES(p_inputs->>'businessName',p_inputs->>'firstName',p_inputs->>'lastName',v_name,v_email,p_inputs->>'phone',p_inputs->>'suburb',p_inputs->>'postcode',p_inputs->>'city',v_state,'lead','not_checked',p_service_areas)
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

CREATE OR REPLACE FUNCTION public.claim_partner_cleaner_email(
 p_request_id uuid, p_user_id uuid, p_session_version uuid, p_subject text, p_history text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r partner_cleaner_intakes%ROWTYPE; u partner_booking_users%ROWTYPE; c partner_booking_companies%ROWTYPE;
 cleaner cleaners%ROWTYPE; v_email_id uuid;
BEGIN
 SELECT * INTO u FROM partner_booking_users WHERE id = p_user_id FOR SHARE;
 SELECT * INTO c FROM partner_booking_companies WHERE id = u.company_id FOR SHARE;
 SELECT * INTO r FROM partner_cleaner_intakes WHERE id = p_request_id AND user_id = p_user_id FOR UPDATE;
 IF NOT FOUND OR r.email_status <> 'queued' THEN RETURN NULL; END IF;
 SELECT * INTO cleaner FROM cleaners WHERE id = r.cleaner_id FOR SHARE;
 IF u.id IS NULL OR NOT u.active OR u.session_version IS DISTINCT FROM p_session_version OR NOT c.active OR c.id <> r.company_id
   OR (c.expires_at IS NOT NULL AND c.expires_at <= now()) OR NOT (r.inputs->>'city' = ANY(c.cities))
   OR NOT r.created_cleaner OR cleaner.id IS NULL OR cleaner.status <> 'lead'
   OR lower(btrim(cleaner.email)) IS DISTINCT FROM r.inputs->>'email' OR cleaner.state IS DISTINCT FROM r.inputs->>'state'
   OR EXISTS(SELECT 1 FROM crm_email_suppressions WHERE email_normalized = r.inputs->>'email' AND blocks_all)
   OR EXISTS(SELECT 1 FROM cleaner_broadcast_suppressions WHERE cleaner_id = r.cleaner_id OR email_normalized = r.inputs->>'email') THEN
   UPDATE partner_cleaner_intakes SET email_status = 'skipped', review_reason = 'Access, cleaner details or communication preferences changed before sending. Review required.' WHERE id = r.id;
   RETURN NULL;
 END IF;
 IF COALESCE(length(p_subject),0) NOT BETWEEN 1 AND 240 OR COALESCE(length(p_history),0) NOT BETWEEN 1 AND 2000 THEN
   RAISE EXCEPTION 'Invalid email history';
 END IF;
 INSERT INTO cleaner_emails(cleaner_id,to_email,subject,body,template_name,status,delivery_outcome,sent_by)
 VALUES(cleaner.id,cleaner.email,p_subject,p_history,'Partner cleaner profile invitation','draft','sending',u.display_name)
 RETURNING id INTO v_email_id;
 UPDATE partner_cleaner_intakes SET email_status = 'sending',email_id = v_email_id WHERE id = r.id;
 RETURN jsonb_build_object('cleanerId',cleaner.id,'email',cleaner.email,'firstName',cleaner.first_name,'businessName',cleaner.business_name);
END $$;

CREATE OR REPLACE FUNCTION public.complete_partner_cleaner_email(p_request_id uuid, p_outcome text, p_provider_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r partner_cleaner_intakes%ROWTYPE;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','unknown') OR (p_outcome = 'sent' AND COALESCE(length(p_provider_id),0) = 0) THEN
   RAISE EXCEPTION 'Invalid delivery outcome';
 END IF;
 SELECT * INTO r FROM partner_cleaner_intakes WHERE id = p_request_id FOR UPDATE;
 IF NOT FOUND OR r.email_status <> 'sending' THEN RAISE EXCEPTION 'Unclaimed delivery'; END IF;
 UPDATE cleaner_emails SET delivery_outcome = p_outcome, status = CASE WHEN p_outcome = 'sent' THEN 'sent' WHEN p_outcome = 'failed' THEN 'failed' ELSE 'draft' END,
   provider_message_id = p_provider_id, sent_at = CASE WHEN p_outcome = 'sent' THEN now() ELSE NULL END,
   error_message = CASE WHEN p_outcome = 'sent' THEN NULL ELSE 'Profile invitation needs a delivery check. Review Resend before sending another link.' END WHERE id = r.email_id;
 UPDATE partner_cleaner_intakes SET email_status = p_outcome, review_reason = CASE WHEN p_outcome = 'sent' THEN NULL ELSE 'Profile invitation needs a delivery check. Review Resend before sending another link.' END WHERE id = r.id;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('partner_cleaner_intake',r.id::text,'partner.cleaner.email_completed',jsonb_build_object('outcome',p_outcome,'emailId',r.email_id));
END $$;
REVOKE ALL ON FUNCTION public.create_partner_cleaner_intake(uuid,uuid,uuid,text,jsonb,text[]), public.claim_partner_cleaner_email(uuid,uuid,uuid,text,text), public.complete_partner_cleaner_email(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_cleaner_intake(uuid,uuid,uuid,text,jsonb,text[]), public.claim_partner_cleaner_email(uuid,uuid,uuid,text,text), public.complete_partner_cleaner_email(uuid,text,text) TO service_role;
COMMIT;
