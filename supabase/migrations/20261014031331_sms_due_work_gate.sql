-- Compatible with the existing worker. Existing jobs/due dates are not rewritten.
BEGIN;
ALTER TABLE public.sms_settings ALTER COLUMN delay_minutes SET DEFAULT 5;
UPDATE public.sms_settings SET delay_minutes=5, updated_at=now() WHERE delay_minutes<5;
ALTER TABLE public.sms_settings DROP CONSTRAINT IF EXISTS sms_settings_delay_minutes_check;
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_delay_minutes_check CHECK(delay_minutes BETWEEN 5 AND 120);

CREATE INDEX IF NOT EXISTS sms_ready_due ON public.sms_jobs(due_at) WHERE status IN ('queued','unknown');
CREATE INDEX IF NOT EXISTS sms_expired_lease ON public.sms_jobs(lease_until) WHERE status IN ('leased','submitting');
CREATE INDEX IF NOT EXISTS sms_reconcile_due ON public.sms_jobs(reconcile_at) WHERE status='submitted';
CREATE INDEX IF NOT EXISTS sms_first_reconcile_due ON public.sms_jobs((coalesce(submitted_at,created_at))) WHERE status='submitted' AND reconcile_at IS NULL;
CREATE INDEX IF NOT EXISTS sms_pending_preference ON public.sms_preferences(updated_at) WHERE provider_sync_pending;
CREATE INDEX IF NOT EXISTS sms_pending_alert ON public.sms_alerts(created_at) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.sms_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  settings public.sms_settings%ROWTYPE;
  work_due timestamptz;
  endpoint text;
  secret text;
BEGIN
  -- Overlapping scheduler calls may not queue overlapping wakeups in one transaction.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('sms_tick',0)) THEN RETURN; END IF;
  SELECT * INTO settings FROM public.sms_settings WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SMS settings missing'; END IF;
  IF settings.worker_lease_until>now() THEN RETURN; END IF;

  -- Each lookup stops at its oldest indexed candidate. No customer content is read.
  SELECT min(due) INTO work_due FROM (
    (SELECT due_at AS due FROM public.sms_jobs WHERE status IN ('queued','unknown') ORDER BY due_at LIMIT 1)
    UNION ALL
    (SELECT lease_until FROM public.sms_jobs WHERE status IN ('leased','submitting') ORDER BY lease_until LIMIT 1)
    UNION ALL
    (SELECT reconcile_at + interval '1 hour' FROM public.sms_jobs
      WHERE status='submitted' AND reconcile_at IS NOT NULL ORDER BY reconcile_at LIMIT 1)
    UNION ALL
    (SELECT coalesce(submitted_at,created_at) FROM public.sms_jobs
      WHERE status='submitted' AND reconcile_at IS NULL ORDER BY coalesce(submitted_at,created_at) LIMIT 1)
    UNION ALL
    (SELECT updated_at FROM public.sms_preferences WHERE provider_sync_pending ORDER BY updated_at LIMIT 1)
    UNION ALL
    (SELECT created_at FROM public.sms_alerts WHERE status='pending' ORDER BY created_at LIMIT 1)
    UNION ALL
    -- Keep missed-webhook recovery even with no outbound work or automation disabled.
    SELECT coalesce(settings.worker_at,settings.inbound_checked_at) + interval '15 minutes'
  ) candidates;
  IF work_due>now() OR work_due IS NULL THEN RETURN; END IF;

  -- An intentionally idle worker is healthy. Alert only when due work waits ten
  -- minutes without a heartbeat (maintenance gets its own fifteen-minute grace).
  IF work_due<now()-interval '10 minutes'
     AND (settings.worker_at IS NULL OR settings.worker_at<now()-interval '10 minutes') THEN
    INSERT INTO public.sms_alerts(dedupe_key,code)
    VALUES('worker_stale:'||current_date::text,'sms_worker_stale') ON CONFLICT DO NOTHING;
  END IF;

  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='sms_worker_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='sms_worker_secret';
  IF endpoint IS DISTINCT FROM 'https://securecleaning.com.au/api/sms/worker'
     OR secret IS NULL OR length(secret)<32 THEN RAISE EXCEPTION 'SMS scheduler configuration missing'; END IF;
  -- No persisted "sent wakeup" flag: a lost HTTP request is retried next tick.
  -- Existing worker/job leases and provider idempotency remain authoritative.
  PERFORM net.http_post(url=>endpoint,
    headers=>jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),
    body=>'{}'::jsonb,timeout_milliseconds=>60000);
END $$;
-- CREATE OR REPLACE preserves the existing function's restricted grants.
COMMIT;
