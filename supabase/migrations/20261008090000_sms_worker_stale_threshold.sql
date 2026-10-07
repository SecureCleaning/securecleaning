-- Raise the SMS worker outage alert only after a sustained ten-minute gap.
-- The minute scheduler and worker endpoint remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.sms_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  endpoint text;
  secret text;
BEGIN
  SELECT decrypted_secret INTO endpoint
  FROM vault.decrypted_secrets
  WHERE name = 'sms_worker_url';

  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'sms_worker_secret';

  IF endpoint IS DISTINCT FROM 'https://securecleaning.com.au/api/sms/worker'
     OR secret IS NULL
     OR length(secret) < 32 THEN
    RAISE EXCEPTION 'SMS scheduler configuration missing';
  END IF;

  INSERT INTO public.sms_alerts(dedupe_key, code)
  SELECT 'worker_stale:' || current_date::text, 'sms_worker_stale'
  FROM public.sms_settings
  WHERE id
    AND (worker_at IS NULL OR worker_at < now() - interval '10 minutes')
  ON CONFLICT DO NOTHING;

  PERFORM net.http_post(
    url => endpoint,
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    body => '{}'::jsonb,
    timeout_milliseconds => 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_tick() TO service_role;

COMMIT;
