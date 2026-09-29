-- SMS outbox. Apply after final quote and CRM migrations; sending remains OFF.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), auto_enabled boolean NOT NULL DEFAULT false,
  delay_minutes integer NOT NULL DEFAULT 5 CHECK(delay_minutes BETWEEN 1 AND 120),
  template text NOT NULL DEFAULT 'Secure Cleaning: We''ve emailed your quote. Please check your inbox and junk folder. Can''t find it? Reply here and we''ll help. Reply STOP to opt out.',
  alert_email text NOT NULL DEFAULT 'info@securecleaning.com.au',
  low_credit_threshold integer NOT NULL DEFAULT 100 CHECK(low_credit_threshold >= 0),
  credit_price_cents numeric NOT NULL DEFAULT 4 CHECK(credit_price_cents BETWEEN 0 AND 100),
  max_parts integer NOT NULL DEFAULT 2 CHECK(max_parts BETWEEN 1 AND 5),
  worker_lease_until timestamptz, worker_token uuid,
  health jsonb NOT NULL DEFAULT '{}', worker_at timestamptz, webhook_at timestamptz, inbound_checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sms_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sms_preferences (
  mobile text PRIMARY KEY CHECK(mobile ~ '^614[0-9]{8}$'),
  consent boolean NOT NULL DEFAULT false, opted_out boolean NOT NULL DEFAULT false,
  evidence text NOT NULL, actor_id text NOT NULL, provider_sync_pending boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sms_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purpose text NOT NULL,
  entity_type text NOT NULL, entity_ref text NOT NULL,
  quote_ref text REFERENCES public.quotes(quote_ref) ON DELETE SET NULL,
  document_version integer, email_attempt_id uuid,
  automatic boolean NOT NULL DEFAULT false, mobile text NOT NULL,
  template text NOT NULL DEFAULT '', fields jsonb NOT NULL DEFAULT '{}', message text NOT NULL DEFAULT '',
  time_zone text NOT NULL, due_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','leased','submitting','unknown','submitted','delivered','failed','cancelled','skipped','review')),
  reason text, actor_id text NOT NULL, cancel_requested boolean NOT NULL DEFAULT false,
  provider_id text UNIQUE, provider_scope text, request_payload jsonb,
  first_attempt_at timestamptz, submitted_at timestamptz, credits numeric,
  attempt_count integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  reconcile_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS sms_auto_once ON public.sms_jobs(purpose,entity_ref,document_version) WHERE automatic;
CREATE INDEX IF NOT EXISTS sms_due ON public.sms_jobs(status,due_at);
CREATE INDEX IF NOT EXISTS sms_quote_history ON public.sms_jobs(quote_ref,created_at DESC);
CREATE INDEX IF NOT EXISTS sms_mobile_history ON public.sms_jobs(mobile,created_at DESC);
CREATE TABLE IF NOT EXISTS public.sms_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
  job_id uuid REFERENCES public.sms_jobs(id) ON DELETE SET NULL,
  kind text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sms_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
  job_id uuid REFERENCES public.sms_jobs(id) ON DELETE SET NULL,
  mobile text NOT NULL, message text NOT NULL, opted_out boolean NOT NULL DEFAULT false,
  read_at timestamptz, read_by text, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sms_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE,
  code text NOT NULL, job_id uuid, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, recipient text, first_attempt_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_settings, public.sms_preferences, public.sms_jobs, public.sms_events, public.sms_replies, public.sms_alerts TO service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sms_settings','sms_preferences','sms_jobs','sms_events','sms_replies','sms_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.sms_mobile(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN n ~ '^04[0-9]{8}$' THEN '61'||substr(n,2) WHEN n ~ '^614[0-9]{8}$' THEN n ELSE NULL END
 FROM (SELECT CASE WHEN v ~ '^[+0-9[:space:]().-]+$' THEN regexp_replace(v,'[^0-9]','','g') END AS n) x;
$$;
CREATE OR REPLACE FUNCTION public.sms_next_time(t timestamptz,z text) RETURNS timestamptz LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE l timestamp := t AT TIME ZONE z;
BEGIN
 IF extract(isodow FROM l)<6 AND l::time >= time '09:00' AND l::time < time '18:00' THEN RETURN t; END IF;
 IF l::time >= time '18:00' THEN l:=date_trunc('day',l)+interval '1 day'; END IF;
 l:=date_trunc('day',l)+interval '9 hours';
 WHILE extract(isodow FROM l)>5 LOOP l:=l+interval '1 day'; END LOOP;
 RETURN l AT TIME ZONE z;
END $$;
CREATE OR REPLACE FUNCTION public.sms_job_deadline() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.expires_at:=NEW.due_at+interval '24 hours'; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS sms_set_deadline ON public.sms_jobs;
CREATE TRIGGER sms_set_deadline BEFORE INSERT ON public.sms_jobs FOR EACH ROW EXECUTE FUNCTION public.sms_job_deadline();
CREATE OR REPLACE FUNCTION public.sms_queue_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; s public.sms_settings%ROWTYPE; z text; m text;
BEGIN
 IF NEW.status NOT IN ('provider_accepted','finalized') OR nullif(trim(NEW.provider_message_id),'') IS NULL OR
    (TG_OP='UPDATE' AND OLD.provider_message_id IS NOT NULL AND OLD.status IN ('provider_accepted','finalized')) THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.sms_settings WHERE id;
 IF NOT s.auto_enabled THEN RETURN NEW; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_ref=NEW.quote_ref;
 IF NOT FOUND OR q.final_quote_document_version <> NEW.document_version THEN RETURN NEW; END IF;
 z:=CASE q.final_quote_document->'inputs'->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'melbourne' THEN 'Australia/Melbourne' END;
 m:=public.sms_mobile(q.final_quote_document->'inputs'->>'phone');
 INSERT INTO public.sms_jobs(purpose,entity_type,entity_ref,quote_ref,document_version,email_attempt_id,automatic,mobile,template,fields,time_zone,due_at,status,reason,actor_id)
 VALUES('quote_followup','quote',q.quote_ref,q.quote_ref,NEW.document_version,NEW.id,true,coalesce(m,''),s.template,
 jsonb_build_object('client_name',coalesce(q.final_quote_document->'inputs'->>'contactName',''),'first_name',split_part(coalesce(q.final_quote_document->'inputs'->>'contactName',''),' ',1),'quote_reference',q.quote_ref),coalesce(z,'Australia/Sydney'),
 public.sms_next_time(coalesce(NEW.provider_accepted_at,now())+make_interval(mins=>s.delay_minutes),coalesce(z,'Australia/Sydney')),
 CASE WHEN m IS NULL OR z IS NULL THEN 'skipped' ELSE 'queued' END,
 CASE WHEN m IS NULL THEN 'invalid_mobile' WHEN z IS NULL THEN 'unknown_timezone' END,coalesce(NEW.actor->>'id','system')) ON CONFLICT DO NOTHING;
 IF m IS NULL OR z IS NULL THEN
  INSERT INTO public.sms_alerts(dedupe_key,code,job_id) SELECT 'eligibility:'||id::text,reason,id FROM public.sms_jobs WHERE quote_ref=q.quote_ref AND automatic AND document_version=NEW.document_version ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sms_on_email_acceptance ON public.quote_send_attempts;
CREATE TRIGGER sms_on_email_acceptance AFTER INSERT OR UPDATE ON public.quote_send_attempts FOR EACH ROW EXECUTE FUNCTION public.sms_queue_quote();
CREATE OR REPLACE FUNCTION public.sms_cancel_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.status IN ('accepted','withdrawn','deleted','superseded','expired','declined','cancelled') OR
 NEW.firm_quote_workflow->>'status' IN ('accepted','withdrawn','deleted','superseded','expired','declined','cancelled') OR
 NEW.final_quote_document_version IS DISTINCT FROM OLD.final_quote_document_version THEN
  UPDATE public.sms_jobs SET cancel_requested=true,
   status=CASE WHEN first_attempt_at IS NULL THEN 'cancelled' ELSE status END,
   reason='quote_changed_or_removed',updated_at=now()
   WHERE quote_ref=OLD.quote_ref AND status IN ('queued','leased','submitting','unknown','review');
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sms_on_quote_change ON public.quotes;
CREATE TRIGGER sms_on_quote_change BEFORE UPDATE OR DELETE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.sms_cancel_quote();
CREATE OR REPLACE FUNCTION public.sms_cancel_preference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.opted_out OR NOT NEW.consent THEN
  UPDATE public.sms_jobs SET cancel_requested=true,status=CASE WHEN first_attempt_at IS NULL THEN 'cancelled' ELSE status END,reason='sms_opted_out',updated_at=now()
  WHERE mobile=NEW.mobile AND status IN ('queued','leased','submitting','unknown','review');
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sms_on_preference ON public.sms_preferences;
CREATE TRIGGER sms_on_preference AFTER INSERT OR UPDATE ON public.sms_preferences FOR EACH ROW EXECUTE FUNCTION public.sms_cancel_preference();
CREATE OR REPLACE FUNCTION public.sms_cancel_disabled() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.auto_enabled AND NOT NEW.auto_enabled THEN
  UPDATE public.sms_jobs SET cancel_requested=true,status=CASE WHEN first_attempt_at IS NULL THEN 'cancelled' ELSE status END,reason='automation_disabled',updated_at=now()
  WHERE automatic AND status IN ('queued','leased','submitting','unknown','review');
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sms_on_settings ON public.sms_settings;
CREATE TRIGGER sms_on_settings AFTER UPDATE ON public.sms_settings FOR EACH ROW EXECUTE FUNCTION public.sms_cancel_disabled();
CREATE OR REPLACE FUNCTION public.sms_claim(p_token uuid) RETURNS SETOF public.sms_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.sms_jobs SET status=CASE WHEN first_attempt_at IS NULL THEN 'queued' ELSE 'unknown' END,lease_token=NULL,lease_until=NULL
 WHERE status IN ('leased','submitting') AND lease_until<now();
 RETURN QUERY UPDATE public.sms_jobs j SET status='leased',lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now()
 WHERE j.id IN (SELECT id FROM public.sms_jobs WHERE status IN ('queued','unknown') AND due_at<=now() ORDER BY due_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING j.*;
END $$;
-- Serialise the final eligibility check with quote updates, preferences and recipient cooldown.
CREATE OR REPLACE FUNCTION public.sms_dispatch(p_id uuid,p_token uuid,p_message text,p_payload jsonb,p_scope text)
RETURNS SETOF public.sms_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE j public.sms_jobs%ROWTYPE; q public.quotes%ROWTYPE; pref public.sms_preferences%ROWTYPE; s public.sms_settings%ROWTYPE; why text;
BEGIN
 SELECT * INTO j FROM public.sms_jobs WHERE id=p_id AND lease_token=p_token AND status='leased' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sms:'||j.mobile,0));
 SELECT * INTO s FROM public.sms_settings WHERE id;
 SELECT * INTO pref FROM public.sms_preferences WHERE mobile=j.mobile FOR UPDATE;
 IF j.cancel_requested THEN why:='cancelled';
 ELSIF j.automatic AND NOT s.auto_enabled THEN why:='automation_disabled';
 ELSIF j.mobile !~ '^614[0-9]{8}$' THEN why:='invalid_mobile';
 ELSIF pref.opted_out THEN why:='sms_opted_out';
 ELSIF j.purpose<>'test' AND NOT coalesce(pref.consent,false) THEN why:='sms_consent_missing';
 ELSIF public.sms_next_time(now(),j.time_zone)>now() THEN
  UPDATE public.sms_jobs SET status='queued',due_at=public.sms_next_time(now(),j.time_zone),lease_token=NULL,lease_until=NULL WHERE id=j.id; RETURN;
 ELSIF j.created_at<now()-interval '7 days' OR j.expires_at<now() THEN why:='reminder_stale';
 END IF;
 IF j.entity_type='quote' THEN
  SELECT * INTO q FROM public.quotes WHERE quote_ref=j.quote_ref FOR UPDATE;
  IF NOT FOUND OR q.valid_until<now() OR q.final_quote_document_version IS DISTINCT FROM j.document_version OR
   q.status IN ('accepted','withdrawn','deleted','superseded','expired','declined','cancelled') OR
   q.firm_quote_workflow->>'status' IN ('accepted','withdrawn','deleted','superseded','expired','declined','cancelled') THEN why:='quote_changed_or_removed';
  ELSIF public.sms_mobile(q.final_quote_document->'inputs'->>'phone') IS DISTINCT FROM j.mobile THEN why:='mobile_changed';
  ELSIF NOT EXISTS(SELECT 1 FROM public.quote_send_attempts a WHERE a.quote_ref=j.quote_ref AND a.document_version=j.document_version AND nullif(trim(a.provider_message_id),'') IS NOT NULL AND a.status IN ('provider_accepted','finalized')) THEN why:='email_not_confirmed'; END IF;
 END IF;
 IF j.first_attempt_at IS NOT NULL AND (j.first_attempt_at<now()-interval '23 hours' OR j.provider_scope IS DISTINCT FROM p_scope) THEN why:='unknown_requires_reconciliation'; END IF;
 IF j.first_attempt_at IS NULL AND EXISTS(SELECT 1 FROM public.sms_jobs other WHERE other.id<>j.id AND other.mobile=j.mobile AND (other.status IN ('submitting','unknown','review') OR (other.first_attempt_at>now()-CASE WHEN j.automatic THEN interval '24 hours' ELSE interval '1 minute' END AND other.status IN ('submitted','delivered'))) ) THEN why:='recipient_cooldown'; END IF;
 IF why IS NOT NULL THEN
  UPDATE public.sms_jobs SET status=CASE WHEN first_attempt_at IS NULL THEN 'skipped' ELSE 'review' END,reason=why,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  RETURN;
 END IF;
 IF j.request_payload IS NOT NULL AND j.request_payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'SMS payload changed'; END IF;
 RETURN QUERY UPDATE public.sms_jobs SET status='submitting',first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1,
 message=p_message,request_payload=p_payload,provider_scope=p_scope,updated_at=now() WHERE id=j.id RETURNING *;
END $$;
-- Stored event processing makes webhook retries safe, including STOP cancellation.
CREATE OR REPLACE FUNCTION public.sms_apply_event(p_key text,p_job uuid,p_kind text,p_payload jsonb,p_mobile text,p_message text,p_optout boolean,p_received timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE affected integer; failed boolean; parts integer; total integer;
BEGIN
 INSERT INTO public.sms_events(event_key,job_id,kind,payload) VALUES(p_key,p_job,p_kind,p_payload) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT; IF affected=0 THEN RETURN false; END IF;
 IF p_kind='inbound' THEN
  INSERT INTO public.sms_replies(event_key,job_id,mobile,message,opted_out,received_at) VALUES(p_key,p_job,p_mobile,p_message,p_optout,p_received);
  IF p_optout THEN
   INSERT INTO public.sms_preferences(mobile,consent,opted_out,evidence,actor_id,provider_sync_pending) VALUES(p_mobile,false,true,'Inbound unsubscribe','client',true)
   ON CONFLICT(mobile) DO UPDATE SET consent=false,opted_out=true,evidence='Inbound unsubscribe',actor_id='client',provider_sync_pending=true,updated_at=now();
  END IF;
 ELSIF p_job IS NOT NULL THEN
  SELECT bool_or(payload->>'status'='failed'),count(DISTINCT (payload->>'part_number')::int),max((payload->>'total_parts')::int)
  INTO failed,parts,total FROM public.sms_events WHERE job_id=p_job AND kind='status';
  UPDATE public.sms_jobs SET status=CASE WHEN failed THEN 'failed' WHEN parts>=total THEN 'delivered' ELSE 'submitted' END,
  provider_id=coalesce(provider_id,p_payload->>'message_id'),reason=CASE WHEN failed THEN 'delivery_failed' ELSE NULL END,updated_at=now() WHERE id=p_job;
 END IF;
 UPDATE public.sms_events SET processed_at=now() WHERE event_key=p_key;
 UPDATE public.sms_settings SET webhook_at=now() WHERE id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.sms_enqueue_manual(p_id uuid,p_quote_ref text,p_version integer,p_mobile text,p_message text,p_zone text,p_test boolean,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE j public.sms_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sms:'||p_mobile,0));
 SELECT * INTO j FROM public.sms_jobs WHERE id=p_id;
 IF FOUND THEN RETURN j.actor_id=p_actor AND j.mobile=p_mobile AND j.message=p_message AND j.quote_ref IS NOT DISTINCT FROM p_quote_ref AND j.document_version IS NOT DISTINCT FROM p_version; END IF;
 IF p_mobile !~ '^614[0-9]{8}$' OR p_zone NOT IN ('Australia/Sydney','Australia/Melbourne') OR length(p_message)>1500 THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.sms_jobs WHERE actor_id=p_actor AND NOT automatic AND created_at>now()-interval '1 hour')>=20 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_jobs WHERE mobile=p_mobile AND (status IN ('submitting','unknown','review') OR (NOT automatic AND status IN ('queued','leased')) OR (first_attempt_at>now()-interval '1 minute' AND status IN ('submitted','delivered')))) THEN RETURN false; END IF;
 UPDATE public.sms_jobs SET status='cancelled',cancel_requested=true,reason='replaced_by_manual_sms',updated_at=now()
 WHERE quote_ref=p_quote_ref AND document_version=p_version AND automatic AND first_attempt_at IS NULL AND status IN ('queued','leased');
 INSERT INTO public.sms_jobs(id,purpose,entity_type,entity_ref,quote_ref,document_version,mobile,message,template,time_zone,due_at,actor_id)
 VALUES(p_id,CASE WHEN p_test THEN 'test' ELSE 'quote_manual' END,CASE WHEN p_test THEN 'test' ELSE 'quote' END,coalesce(p_quote_ref,p_id::text),p_quote_ref,p_version,p_mobile,p_message,p_message,p_zone,public.sms_next_time(now(),p_zone),p_actor);
 RETURN true;
END $$;
-- Compare-and-set outcome: a receipt arriving before the send response wins.
CREATE OR REPLACE FUNCTION public.sms_record_acceptance(p_id uuid,p_provider text,p_credits numeric)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 UPDATE public.sms_jobs SET provider_id=coalesce(provider_id,p_provider),credits=p_credits,submitted_at=coalesce(submitted_at,now()),
 status=CASE WHEN status IN ('delivered','failed') THEN status ELSE 'submitted' END,lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE id=p_id AND (provider_id IS NULL OR provider_id=p_provider);
$$;
CREATE OR REPLACE FUNCTION public.sms_worker_lock(p_token uuid) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH locked AS (UPDATE public.sms_settings SET worker_token=p_token,worker_lease_until=now()+interval '90 seconds' WHERE id AND (worker_lease_until IS NULL OR worker_lease_until<now()) RETURNING id) SELECT EXISTS(SELECT 1 FROM locked);
$$;
CREATE OR REPLACE FUNCTION public.sms_save_settings(p_previous timestamptz,p_values jsonb,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.sms_settings SET auto_enabled=(p_values->>'auto_enabled')::boolean,delay_minutes=(p_values->>'delay_minutes')::integer,
 template=p_values->>'template',alert_email=p_values->>'alert_email',low_credit_threshold=(p_values->>'low_credit_threshold')::integer,
 credit_price_cents=(p_values->>'credit_price_cents')::numeric,max_parts=(p_values->>'max_parts')::integer,updated_at=now()
 WHERE id AND updated_at=p_previous;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details) VALUES('sms','settings','sms.settings.updated',jsonb_build_object('actorId',p_actor,'settings',p_values));
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.sms_save_preference(p_mobile text,p_consent boolean,p_evidence text,p_actor text,p_quote_ref text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sms:'||p_mobile,0));
 IF p_consent AND EXISTS(SELECT 1 FROM public.sms_preferences WHERE mobile=p_mobile AND opted_out) THEN RETURN false; END IF;
 INSERT INTO public.sms_preferences(mobile,consent,opted_out,evidence,actor_id,provider_sync_pending)
 VALUES(p_mobile,p_consent,NOT p_consent,p_evidence,p_actor,NOT p_consent)
 ON CONFLICT(mobile) DO UPDATE SET consent=excluded.consent,opted_out=excluded.opted_out,evidence=excluded.evidence,actor_id=excluded.actor_id,provider_sync_pending=excluded.provider_sync_pending,updated_at=now();
 INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details) VALUES('quote',p_quote_ref,'sms.permission.updated',jsonb_build_object('actorId',p_actor,'consent',p_consent,'evidence',p_evidence));
 RETURN true;
END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sms_mobile','sms_next_time','sms_queue_quote','sms_cancel_quote','sms_cancel_preference','sms_cancel_disabled','sms_claim','sms_dispatch','sms_apply_event','sms_enqueue_manual','sms_record_acceptance','sms_worker_lock','sms_save_settings','sms_save_preference','sms_job_deadline') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
