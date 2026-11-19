BEGIN;
-- No backfill: interrupted historical campaigns require an explicit resume.
CREATE TABLE public.background_email_jobs (
  kind text NOT NULL CHECK (kind IN ('broadcast','cleaner_batch')),
  target_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','review','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  failures integer NOT NULL DEFAULT 0,
  failure_code text,
  PRIMARY KEY (kind,target_id)
);
ALTER TABLE public.background_email_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.background_email_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.background_email_jobs TO service_role;
CREATE INDEX background_email_actor ON public.background_email_jobs(actor_id);
CREATE INDEX background_email_due ON public.background_email_jobs(next_attempt_at) WHERE status IN ('queued','running');

-- Exposes configuration readiness only, never the Vault values.
CREATE FUNCTION public.background_email_worker_ready() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='bulk_email_worker_url' AND decrypted_secret='https://securecleaning.com.au/api/email/worker')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='bulk_email_worker_secret' AND length(decrypted_secret)>=32)
    AND EXISTS (SELECT 1 FROM cron.job WHERE jobname='secure-cleaning-background-email' AND active);
$$;
REVOKE ALL ON FUNCTION public.background_email_worker_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.background_email_worker_ready() TO service_role;

CREATE FUNCTION public.enqueue_background_email(p_kind text,p_target_id uuid,p_actor_id uuid,p_resume boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_staff_accounts WHERE id=p_actor_id AND active AND role::text IN ('owner','manager','staff','agent')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_kind='broadcast' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cleaner_broadcast_campaigns WHERE id=p_target_id AND created_by_staff_id=p_actor_id AND delivery_snapshot IS NOT NULL) THEN
      RAISE EXCEPTION 'Broadcast unavailable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cleaner_broadcast_campaigns WHERE id=p_target_id AND status='sending') THEN RETURN; END IF;
  ELSIF p_kind='cleaner_batch' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cleaner_email_batches WHERE id=p_target_id AND actor_id=p_actor_id AND delivery IS NOT NULL) THEN
      RAISE EXCEPTION 'Batch unavailable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cleaner_emails WHERE batch_id=p_target_id AND delivery_outcome IN ('queued','sending')) THEN RETURN; END IF;
  ELSE RAISE EXCEPTION 'Invalid queue kind'; END IF;
  IF NOT public.background_email_worker_ready() THEN RAISE EXCEPTION 'Background email scheduler configuration missing'; END IF;
  INSERT INTO public.background_email_jobs(kind,target_id,actor_id) VALUES(p_kind,p_target_id,p_actor_id) ON CONFLICT DO NOTHING;
  -- Duplicate Send / status requests cannot unpause a quota or review hold.
  IF p_resume THEN
    UPDATE public.background_email_jobs SET status='queued',next_attempt_at=now(),updated_at=now(),failures=0,failure_code=NULL
      WHERE kind=p_kind AND target_id=p_target_id AND actor_id=p_actor_id AND status IN ('paused','review');
  END IF;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('background_email',p_target_id::text,CASE WHEN p_resume THEN 'email.background.resume' ELSE 'email.background.enqueue' END,jsonb_build_object('kind',p_kind,'actorId',p_actor_id));
END $$;

CREATE FUNCTION public.claim_background_email_job(p_token uuid)
RETURNS SETOF public.background_email_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'Lease required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT kind,target_id FROM public.background_email_jobs
    WHERE status IN ('queued','running') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())
    ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE public.background_email_jobs j SET status='running',lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now()
    FROM candidate c WHERE j.kind=c.kind AND j.target_id=c.target_id RETURNING j.*;
END $$;

CREATE FUNCTION public.finish_background_email_job(p_kind text,p_target_id uuid,p_token uuid,p_status text,p_failure_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF p_status NOT IN ('queued','paused','review','completed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.background_email_jobs SET status=p_status,failure_code=p_failure_code,
    failures=CASE WHEN p_failure_code IS NULL THEN 0 ELSE failures+1 END,
    next_attempt_at=now()+CASE WHEN p_failure_code IS NULL THEN interval '1 second' ELSE interval '1 minute' END,
    updated_at=now(),lease_token=NULL,lease_until=NULL
    WHERE kind=p_kind AND target_id=p_target_id AND lease_token=p_token AND status='running';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_background_email(text,uuid,uuid,boolean),public.claim_background_email_job(uuid),public.finish_background_email_job(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_background_email(text,uuid,uuid,boolean),public.claim_background_email_job(uuid),public.finish_background_email_job(text,uuid,uuid,text,text) TO service_role;

-- Same authenticated pg_net scheduler pattern as the existing SMS worker.
-- Configure Vault + matching Vercel secret before enabling new sends.
CREATE FUNCTION public.background_email_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE endpoint text; secret text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('background_email_tick',0)) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.background_email_jobs WHERE status IN ('queued','running') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())) THEN RETURN; END IF;
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='bulk_email_worker_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='bulk_email_worker_secret';
  IF endpoint IS DISTINCT FROM 'https://securecleaning.com.au/api/email/worker' OR secret IS NULL OR length(secret)<32 THEN
    RAISE EXCEPTION 'Background email scheduler configuration missing';
  END IF;
  PERFORM net.http_post(url=>endpoint,headers=>jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body=>'{}'::jsonb,timeout_milliseconds=>60000);
END $$;
REVOKE ALL ON FUNCTION public.background_email_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.background_email_tick() TO service_role;
SELECT cron.schedule('secure-cleaning-background-email','15 seconds','select public.background_email_tick()');
COMMIT;
