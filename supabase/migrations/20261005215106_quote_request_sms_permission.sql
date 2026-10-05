-- Forward-only rollout after sms_workflow_migration and sms_quote_status_enum_repair.
-- Apply before application deploy. No historical permission or SMS backfill.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sms_quote_requests (
  quote_ref text NOT NULL REFERENCES public.quotes(quote_ref) ON DELETE CASCADE,
  mobile text NOT NULL CHECK (mobile ~ '^614[0-9]{8}$'),
  source text NOT NULL CHECK (source IN ('online_request', 'agent_request')),
  allowed boolean NOT NULL, actor_id text NOT NULL, notice_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_ref, mobile)
);
CREATE TABLE IF NOT EXISTS public.sms_remote_quote_emails (
  quote_ref text PRIMARY KEY REFERENCES public.quotes(quote_ref) ON DELETE CASCADE,
  mobile text NOT NULL, recipient text NOT NULL,
  provider_message_id text NOT NULL CHECK (length(trim(provider_message_id)) > 0),
  accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_remote_quote_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_quote_requests, public.sms_remote_quote_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_quote_requests, public.sms_remote_quote_emails TO service_role;

-- Do not turn a specific quote request into a global marketing preference.
CREATE OR REPLACE FUNCTION public.sms_record_quote_request(
  p_quote_ref text, p_mobile text, p_source text, p_actor text, p_allowed boolean, p_notice_version text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; added integer;
BEGIN
  IF p_source NOT IN ('online_request', 'agent_request') OR p_notice_version <> '2026-10-06'
     OR nullif(trim(p_actor), '') IS NULL OR p_mobile !~ '^614[0-9]{8}$' OR p_allowed IS NULL THEN RETURN false; END IF;
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR q.valid_until < now() THEN RETURN false; END IF;
  IF public.sms_mobile(CASE WHEN p_source = 'online_request' THEN q.inputs->>'phone'
       ELSE q.final_quote_document->'inputs'->>'phone' END) IS DISTINCT FROM p_mobile THEN RETURN false; END IF;
  INSERT INTO public.sms_quote_requests(quote_ref, mobile, source, allowed, actor_id, notice_version)
  VALUES(p_quote_ref, p_mobile, p_source, p_allowed, p_actor, p_notice_version)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added > 0 THEN
    INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
    VALUES('quote', p_quote_ref, 'sms.quote_request.recorded', jsonb_build_object(
      'source', p_source, 'actorId', p_actor, 'allowed', p_allowed, 'noticeVersion', p_notice_version));
  END IF;
  RETURN true;
END;
$$;

-- A receipt is written only after the provider has accepted the online quote email.
CREATE OR REPLACE FUNCTION public.sms_record_remote_quote_email(
  p_quote_ref text, p_mobile text, p_recipient text, p_provider_message_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; s public.sms_settings%ROWTYPE; z text; permission boolean; added integer;
BEGIN
  IF nullif(trim(p_provider_message_id), '') IS NULL THEN RETURN false; END IF;
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR public.sms_mobile(q.inputs->>'phone') IS DISTINCT FROM p_mobile
     OR lower(trim(q.inputs->>'email')) IS DISTINCT FROM lower(trim(p_recipient)) THEN RETURN false; END IF;
  SELECT allowed INTO permission FROM public.sms_quote_requests
    WHERE quote_ref = p_quote_ref AND mobile = p_mobile AND source = 'online_request';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.sms_remote_quote_emails(quote_ref, mobile, recipient, provider_message_id)
    VALUES(p_quote_ref, p_mobile, p_recipient, p_provider_message_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added = 0 THEN RETURN true; END IF;
  SELECT * INTO s FROM public.sms_settings WHERE id;
  IF NOT s.auto_enabled THEN RETURN true; END IF;
  z := CASE q.inputs->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'melbourne' THEN 'Australia/Melbourne' END;
  INSERT INTO public.sms_jobs(purpose, entity_type, entity_ref, quote_ref, document_version, automatic,
    mobile, template, fields, time_zone, due_at, status, reason, actor_id)
  VALUES('remote_quote_followup', 'quote', q.quote_ref, q.quote_ref, 0, true, p_mobile,
    'Secure Cleaning: We''ve emailed your quote. Please check your inbox and junk folder. Can''t find it? Reply here and we''ll help. Reply STOP to opt out.',
    jsonb_build_object('quote_reference', q.quote_ref), coalesce(z, 'Australia/Sydney'),
    public.sms_next_time(now() + make_interval(mins => s.delay_minutes), coalesce(z, 'Australia/Sydney')),
    CASE WHEN NOT permission OR z IS NULL THEN 'skipped' ELSE 'queued' END,
    CASE WHEN NOT permission THEN 'quote_email_only' WHEN z IS NULL THEN 'unknown_timezone' END,
    'online_customer') ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

ALTER TABLE public.sms_settings DROP CONSTRAINT IF EXISTS sms_settings_delay_minutes_check;
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_delay_minutes_check CHECK (delay_minutes BETWEEN 0 AND 120);
ALTER TABLE public.sms_settings ALTER COLUMN delay_minutes SET DEFAULT 0;
-- Existing installation used the five-minute default; requested immediate scheduling replaces it.
UPDATE public.sms_settings SET delay_minutes = 0, updated_at = now() WHERE delay_minutes = 5;

CREATE OR REPLACE FUNCTION public.sms_queue_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; s public.sms_settings%ROWTYPE; z text; m text;
BEGIN
 IF NEW.status NOT IN ('provider_accepted','finalized') OR nullif(trim(NEW.provider_message_id),'') IS NULL OR
    (TG_OP='UPDATE' AND OLD.provider_message_id IS NOT NULL AND OLD.status IN ('provider_accepted','finalized')) THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.sms_settings WHERE id;
 IF NOT s.auto_enabled THEN RETURN NEW; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_ref=NEW.quote_ref;
 IF NOT FOUND OR q.final_quote_document_version IS DISTINCT FROM NEW.document_version THEN RETURN NEW; END IF;
 z:=CASE q.final_quote_document->'inputs'->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'melbourne' THEN 'Australia/Melbourne' END;
 m:=public.sms_mobile(q.final_quote_document->'inputs'->>'phone');
 INSERT INTO public.sms_jobs(purpose,entity_type,entity_ref,quote_ref,document_version,email_attempt_id,automatic,mobile,template,fields,time_zone,due_at,status,reason,actor_id)
 VALUES('quote_followup','quote',q.quote_ref,q.quote_ref,NEW.document_version,NEW.id,true,coalesce(m,''),CASE WHEN EXISTS (SELECT 1 FROM public.sms_quote_requests qr WHERE qr.quote_ref=q.quote_ref AND qr.mobile=m AND qr.allowed) THEN 'Secure Cleaning: We''ve emailed your quote. Please check your inbox and junk folder. Can''t find it? Reply here and we''ll help. Reply STOP to opt out.' ELSE s.template END,
 jsonb_build_object('client_name',coalesce(q.final_quote_document->'inputs'->>'contactName',''),'first_name',split_part(coalesce(q.final_quote_document->'inputs'->>'contactName',''),' ',1),'quote_reference',q.quote_ref),coalesce(z,'Australia/Sydney'),
 public.sms_next_time(coalesce(NEW.provider_accepted_at,now())+make_interval(mins=>s.delay_minutes),coalesce(z,'Australia/Sydney')),
 CASE WHEN m IS NULL OR z IS NULL THEN 'skipped' ELSE 'queued' END,
 CASE WHEN m IS NULL THEN 'invalid_mobile' WHEN z IS NULL THEN 'unknown_timezone' END,coalesce(NEW.actor->>'id','system')) ON CONFLICT DO NOTHING;
 IF m IS NULL OR z IS NULL THEN
  INSERT INTO public.sms_alerts(dedupe_key,code,job_id) SELECT 'eligibility:'||id::text,reason,id FROM public.sms_jobs WHERE quote_ref=q.quote_ref AND automatic AND document_version=NEW.document_version ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sms_dispatch(p_id uuid, p_token uuid, p_message text, p_payload jsonb, p_scope text)
RETURNS SETOF public.sms_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  j public.sms_jobs%ROWTYPE;
  q public.quotes%ROWTYPE;
  pref public.sms_preferences%ROWTYPE;
  s public.sms_settings%ROWTYPE;
  why text;
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
    j.automatic AND j.purpose IN ('quote_followup', 'remote_quote_followup') AND EXISTS (
      SELECT 1 FROM public.sms_quote_requests qr WHERE qr.quote_ref=j.quote_ref AND qr.mobile=j.mobile AND qr.allowed
    )
  ) THEN why := 'sms_consent_missing';
  ELSIF public.sms_next_time(now(), j.time_zone) > now() THEN
    UPDATE public.sms_jobs SET status = 'queued', due_at = public.sms_next_time(now(), j.time_zone),
      lease_token = NULL, lease_until = NULL WHERE id = j.id;
    RETURN;
  ELSIF j.created_at < now() - interval '7 days' OR j.expires_at < now() THEN why := 'reminder_stale';
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
      -- The online estimate and the later final quote each warrant one notice.
      -- Space those stages by a minute; keep the daily limit across unrelated quotes.
      SELECT max(other.first_attempt_at + CASE
        WHEN NOT j.automatic OR (other.quote_ref=j.quote_ref AND
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
    ('sms_record_quote_request','sms_record_remote_quote_email','sms_queue_quote','sms_dispatch') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
  END LOOP;
END $$;
COMMIT;
