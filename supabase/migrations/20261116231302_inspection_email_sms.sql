-- New appointment notices only. No backfill, preference changes or live sends.
BEGIN;
CREATE TABLE public.sms_inspection_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('booking','sale_inspection')),
  entity_ref text NOT NULL, kind text NOT NULL CHECK (kind IN ('request','confirmation')),
  snapshot jsonb NOT NULL, snapshot_key text NOT NULL,
  mobile text, recipient text NOT NULL, provider_message_id text NOT NULL CHECK (length(trim(provider_message_id))>0),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type,entity_ref,kind,snapshot_key)
);
ALTER TABLE public.sms_inspection_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_inspection_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.sms_inspection_emails TO service_role;
ALTER TABLE public.sms_jobs ADD COLUMN inspection_email_id uuid REFERENCES public.sms_inspection_emails(id);
CREATE UNIQUE INDEX sms_inspection_once ON public.sms_jobs(inspection_email_id) WHERE inspection_email_id IS NOT NULL;

-- Read current appointment identity at enqueue and again inside the dispatch transaction.
CREATE OR REPLACE FUNCTION public.sms_inspection_context(p_type text,p_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE b public.bookings%ROWTYPE; i public.contract_sale_inspections%ROWTYPE; c record; z text; snapshot jsonb; starts timestamptz; qref text;
BEGIN
 IF p_type='booking' THEN
  SELECT * INTO b FROM public.bookings WHERE booking_ref=p_ref FOR SHARE;
  IF NOT FOUND OR b.status::text IN ('cancelled','completed','declined') THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_booking_requests r WHERE r.booking_id=b.id AND r.request_kind='request' AND r.decision_status='declined') THEN RETURN NULL; END IF;
  z:=CASE b.inputs->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'melbourne' THEN 'Australia/Melbourne' WHEN 'brisbane' THEN 'Australia/Brisbane' END;
  snapshot:=jsonb_build_object('date',coalesce(b.inputs->>'preferredStartDate',''),'start',coalesce(b.inputs->>'preferredInspectionStartTime',''),
    'end',coalesce(b.inputs->>'preferredInspectionEndTime',''),'assignee',coalesce(b.inputs->>'preferredInspectionAssigneeId',''),
    'source',coalesce(b.inputs->>'inspectionBookingSource',''),'proposals',coalesce(nullif(b.inputs->'requestedInspectionTimes','null'::jsonb),'[]'::jsonb));
  IF nullif(snapshot->>'date','') IS NOT NULL AND nullif(snapshot->>'start','') IS NOT NULL AND z IS NOT NULL THEN
    starts:=((snapshot->>'date')||' '||(snapshot->>'start'))::timestamp AT TIME ZONE z;
  END IF;
  SELECT quote_ref INTO qref FROM public.quotes WHERE id=b.quote_id;
  RETURN jsonb_build_object('mobile',public.sms_mobile(b.inputs->>'phone'),'recipient',lower(trim(b.inputs->>'email')),
    'zone',z,'snapshot',snapshot,'startsAt',starts,'quoteRef',qref,'reference',b.booking_ref);
 ELSIF p_type='sale_inspection' THEN
  SELECT * INTO i FROM public.contract_sale_inspections WHERE id::text=p_ref FOR SHARE;
  IF NOT FOUND OR i.status<>'scheduled' THEN RETURN NULL; END IF;
  SELECT s.sale_code,s.status,p.state,cl.phone,cl.email,q.quote_ref INTO c
    FROM public.contract_product_sales s JOIN public.contract_products p ON p.id=s.product_id
    JOIN public.crm_opportunities o ON o.id=s.opportunity_id JOIN public.clients cl ON cl.id=o.primary_contact_id
    LEFT JOIN public.quotes q ON q.id=s.source_quote_id WHERE s.id=i.sale_id;
  IF NOT FOUND OR c.status='cancelled' OR lower(trim(c.email)) IS DISTINCT FROM lower(trim(i.client_email_snapshot)) THEN RETURN NULL; END IF;
  z:=CASE c.state WHEN 'NSW' THEN 'Australia/Sydney' WHEN 'VIC' THEN 'Australia/Melbourne' WHEN 'QLD' THEN 'Australia/Brisbane' END;
  RETURN jsonb_build_object('mobile',public.sms_mobile(c.phone),'recipient',lower(trim(c.email)),'zone',z,
    'snapshot',jsonb_build_object('startsAt',(extract(epoch FROM i.starts_at)*1000)::bigint,'duration',i.duration_minutes,'location',i.location_snapshot),
    'startsAt',i.starts_at,'quoteRef',c.quote_ref,'reference',c.sale_code);
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sms_inspection_block_reason(p_receipt uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.sms_inspection_emails%ROWTYPE; c jsonb;
BEGIN
 SELECT * INTO e FROM public.sms_inspection_emails WHERE id=p_receipt;
 IF NOT FOUND OR nullif(trim(e.provider_message_id),'') IS NULL THEN RETURN 'email_not_confirmed'; END IF;
 c:=public.sms_inspection_context(e.entity_type,e.entity_ref);
 IF c IS NULL OR c->'snapshot' IS DISTINCT FROM e.snapshot THEN RETURN 'inspection_changed_or_removed'; END IF;
 IF c->>'mobile' IS DISTINCT FROM e.mobile OR c->>'recipient' IS DISTINCT FROM e.recipient THEN RETURN 'inspection_contact_changed'; END IF;
 IF (c->>'startsAt')::timestamptz<=now() THEN RETURN 'inspection_passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_quote_requests r WHERE r.quote_ref=c->>'quoteRef' AND r.mobile=e.mobile AND NOT r.allowed) THEN RETURN 'quote_email_only'; END IF;
 RETURN NULL;
END $$;

-- Service-only: the application supplies a receipt only after Resend accepts the client email.
-- The snapshot and destination must still match the actual booking/client, not browser input.
CREATE OR REPLACE FUNCTION public.sms_record_inspection_email(p_entity_type text,p_entity_ref text,p_kind text,
 p_phone text,p_recipient text,p_snapshot jsonb,p_provider_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE c jsonb; e uuid; s public.sms_settings%ROWTYPE; why text; z text; m text; template text; j uuid;
BEGIN
 IF p_entity_type NOT IN ('booking','sale_inspection') OR p_kind NOT IN ('request','confirmation')
    OR (p_entity_type='sale_inspection' AND p_kind<>'confirmation') OR nullif(trim(p_provider_message_id),'') IS NULL THEN RETURN false; END IF;
 c:=public.sms_inspection_context(p_entity_type,p_entity_ref);
 m:=public.sms_mobile(p_phone);
 IF c IS NULL OR c->'snapshot' IS DISTINCT FROM p_snapshot OR c->>'mobile' IS DISTINCT FROM m
    OR c->>'recipient' IS DISTINCT FROM lower(trim(p_recipient)) THEN RETURN false; END IF;
 INSERT INTO public.sms_inspection_emails(entity_type,entity_ref,kind,snapshot,snapshot_key,mobile,recipient,provider_message_id)
 VALUES(p_entity_type,p_entity_ref,p_kind,p_snapshot,md5(p_snapshot::text),m,lower(trim(p_recipient)),trim(p_provider_message_id))
 ON CONFLICT DO NOTHING RETURNING id INTO e;
 IF e IS NULL THEN RETURN true; END IF; -- Retrying/resending the same appointment never adds an SMS.
 SELECT * INTO s FROM public.sms_settings WHERE id;
 z:=c->>'zone';
 why:=public.sms_inspection_block_reason(e);
 IF NOT coalesce(s.auto_enabled,false) THEN why:='automation_disabled';
 ELSIF m IS NULL THEN why:='invalid_mobile';
 ELSIF z IS NULL THEN why:='unknown_timezone';
 ELSIF EXISTS(SELECT 1 FROM public.sms_preferences WHERE sms_preferences.mobile=m AND (opted_out OR NOT consent)) THEN why:='sms_opted_out'; END IF;
 template:=CASE WHEN p_kind='request' THEN 'Secure Cleaning: We''ve emailed your site inspection request. Please check your inbox/junk folder. The time is not confirmed yet. Reply STOP to opt out.'
   WHEN p_entity_type='sale_inspection' THEN 'Secure Cleaning: We''ve emailed your inspection invitation with the purchasing cleaner. Check your inbox/junk folder for details. Reply STOP to opt out.'
   ELSE 'Secure Cleaning: We''ve emailed your site visit confirmation and calendar invitation. Please check your inbox/junk folder for details. Reply STOP to opt out.' END;
 INSERT INTO public.sms_jobs(purpose,entity_type,entity_ref,inspection_email_id,automatic,mobile,template,fields,time_zone,due_at,status,reason,actor_id)
 VALUES(CASE WHEN p_entity_type='sale_inspection' THEN 'sale_inspection' ELSE 'inspection_'||p_kind END,p_entity_type,p_entity_ref,e,true,coalesce(m,''),template,
   jsonb_build_object('reference',c->>'reference'),coalesce(z,'Australia/Sydney'),
   public.sms_next_time(now()+make_interval(mins=>coalesce(s.delay_minutes,5)),coalesce(z,'Australia/Sydney')),
   CASE WHEN why IS NULL THEN 'queued' ELSE 'skipped' END,why,'inspection_email') RETURNING id INTO j;
 IF why IN ('invalid_mobile','unknown_timezone') THEN
   INSERT INTO public.sms_alerts(dedupe_key,code,job_id) VALUES('inspection:'||e::text,why,j) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
 VALUES(p_entity_type,p_entity_ref,'sms.inspection_email.recorded',jsonb_build_object('smsJobId',j,'kind',p_kind,'reason',why));
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.sms_dispatch(p_id uuid, p_token uuid, p_message text, p_payload jsonb, p_scope text)
RETURNS SETOF public.sms_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  j public.sms_jobs%ROWTYPE;
  q public.quotes%ROWTYPE;
  pref public.sms_preferences%ROWTYPE;
  s public.sms_settings%ROWTYPE;
  why text;
  inspection_reason text;
  cooldown_until timestamptz;
BEGIN
  SELECT * INTO j FROM public.sms_jobs
  WHERE id = p_id AND lease_token = p_token AND status = 'leased' AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sms:' || j.mobile, 0));
  SELECT * INTO s FROM public.sms_settings WHERE id;
  SELECT * INTO pref FROM public.sms_preferences WHERE mobile = j.mobile FOR UPDATE;
  IF j.cancel_requested THEN why := 'cancelled';
  ELSIF j.automatic AND NOT s.auto_enabled THEN why := 'automation_disabled';
  ELSIF j.mobile !~ '^614[0-9]{8}$' THEN why := 'invalid_mobile';
  ELSIF pref.opted_out THEN why := 'sms_opted_out';
  ELSIF EXISTS (SELECT 1 FROM public.sms_quote_requests qr WHERE qr.quote_ref=j.quote_ref AND qr.mobile=j.mobile AND NOT qr.allowed) THEN why := 'quote_email_only';
  ELSIF j.purpose <> 'test' AND NOT coalesce(pref.consent, false) AND NOT (
    j.automatic AND (
      (j.purpose IN ('quote_followup', 'remote_quote_followup') AND EXISTS (
        SELECT 1 FROM public.sms_quote_requests qr WHERE qr.quote_ref=j.quote_ref AND qr.mobile=j.mobile AND qr.allowed
      )) OR (j.purpose IN ('inspection_request','inspection_confirmation','sale_inspection') AND EXISTS (
        SELECT 1 FROM public.sms_inspection_emails e WHERE e.id=j.inspection_email_id AND e.mobile=j.mobile
          AND e.entity_type=j.entity_type AND e.entity_ref=j.entity_ref
      ))
    )
  ) THEN why := 'sms_consent_missing';
  ELSIF public.sms_next_time(now(), j.time_zone) > now() THEN
    UPDATE public.sms_jobs SET status = 'queued', due_at = public.sms_next_time(now(), j.time_zone),
      lease_token = NULL, lease_until = NULL WHERE id = j.id;
    RETURN;
  ELSIF j.created_at < now() - interval '7 days' OR j.expires_at < now() THEN why := 'reminder_stale';
  END IF;
  IF j.entity_type IN ('booking','sale_inspection') THEN
    inspection_reason:=public.sms_inspection_block_reason(j.inspection_email_id);
    IF inspection_reason IS NOT NULL THEN why:=coalesce(why,inspection_reason); END IF;
  END IF;
  IF j.entity_type = 'quote' THEN
    SELECT * INTO q FROM public.quotes WHERE quote_ref = j.quote_ref FOR UPDATE;
    IF NOT FOUND OR q.valid_until < now() OR
       (j.purpose <> 'remote_quote_followup' AND q.final_quote_document_version IS DISTINCT FROM j.document_version) OR
       (j.purpose = 'remote_quote_followup' AND q.final_quote_document_version IS NOT NULL) OR
       q.status::text IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') OR
       q.firm_quote_workflow->>'status' IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') THEN
      why := 'quote_changed_or_removed';
    ELSIF j.purpose = 'remote_quote_followup' THEN
      IF public.sms_mobile(q.inputs->>'phone') IS DISTINCT FROM j.mobile THEN why := 'mobile_changed';
      ELSIF NOT EXISTS (SELECT 1 FROM public.sms_remote_quote_emails e WHERE e.quote_ref=j.quote_ref
        AND e.mobile=j.mobile AND lower(trim(e.recipient))=lower(trim(q.inputs->>'email'))
        AND nullif(trim(e.provider_message_id), '') IS NOT NULL) THEN why := 'email_not_confirmed'; END IF;
    ELSIF public.sms_mobile(q.final_quote_document->'inputs'->>'phone') IS DISTINCT FROM j.mobile THEN why := 'mobile_changed';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.quote_send_attempts a
      WHERE a.quote_ref = j.quote_ref AND a.document_version = j.document_version
        AND nullif(trim(a.provider_message_id), '') IS NOT NULL
        AND a.status IN ('provider_accepted', 'finalized')
    ) THEN why := 'email_not_confirmed'; END IF;
  END IF;
  IF j.first_attempt_at IS NOT NULL AND
     (j.first_attempt_at < now() - interval '23 hours' OR j.provider_scope IS DISTINCT FROM p_scope) THEN
    why := 'unknown_requires_reconciliation';
  END IF;
  IF j.first_attempt_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.sms_jobs other WHERE other.id<>j.id AND other.mobile=j.mobile
      AND other.status IN ('submitting','unknown','review')) THEN why := 'recipient_cooldown';
    ELSE
      -- Space appointment notices and the two quote stages by a minute.
      -- Keep the existing daily limit between unrelated quote-only notices.
      SELECT max(other.first_attempt_at + CASE
        WHEN NOT j.automatic OR j.inspection_email_id IS NOT NULL OR other.inspection_email_id IS NOT NULL OR (other.quote_ref=j.quote_ref AND
          ((other.purpose='remote_quote_followup' AND j.purpose='quote_followup') OR
           (other.purpose='quote_followup' AND j.purpose='remote_quote_followup')))
        THEN interval '1 minute' ELSE interval '24 hours' END)
      INTO cooldown_until FROM public.sms_jobs other
      WHERE other.id<>j.id AND other.mobile=j.mobile AND other.status IN ('submitted','delivered');
      IF why IS NULL AND cooldown_until > now() THEN
        UPDATE public.sms_jobs SET status='queued', due_at=public.sms_next_time(cooldown_until,j.time_zone),
          lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
        RETURN;
      END IF;
    END IF;
  END IF;
  IF why IS NOT NULL THEN
    UPDATE public.sms_jobs SET status = CASE WHEN first_attempt_at IS NULL THEN 'skipped' ELSE 'review' END,
      reason = why, lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = j.id;
    RETURN;
  END IF;
  IF j.request_payload IS NOT NULL AND j.request_payload IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'SMS payload changed';
  END IF;
  RETURN QUERY UPDATE public.sms_jobs SET status = 'submitting',
    first_attempt_at = coalesce(first_attempt_at, now()), attempt_count = attempt_count + 1,
    message = p_message, request_payload = p_payload, provider_scope = p_scope, updated_at = now()
    WHERE id = j.id RETURNING *;
END;
$$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('sms_inspection_context','sms_inspection_block_reason','sms_record_inspection_email','sms_dispatch') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
