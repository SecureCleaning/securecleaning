-- OPTIONAL ACTIVATION STEP, after sms_workflow_migration.sql and application deployment.
-- Configure Vault secrets sms_worker_url and sms_worker_secret in the Supabase dashboard first.
-- URL must be https://securecleaning.com.au/api/sms/worker. Secret must equal Vercel SMS_WORKER_SECRET.
-- No credentials belong in SQL files, query history, source control or browser settings.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sms_worker_url' AND decrypted_secret='https://securecleaning.com.au/api/sms/worker') OR
    NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sms_worker_secret' AND length(decrypted_secret)>=32) THEN
  RAISE EXCEPTION 'Configure SMS worker Vault secrets before scheduling';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.sms_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE endpoint text; secret text;
BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='sms_worker_url';
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='sms_worker_secret';
 IF endpoint IS DISTINCT FROM 'https://securecleaning.com.au/api/sms/worker' OR length(secret)<32 OR secret IS NULL THEN RAISE EXCEPTION 'SMS scheduler configuration missing'; END IF;
 -- Record an outage even if the application cannot currently deliver its alert email.
 INSERT INTO public.sms_alerts(dedupe_key,code)
 SELECT 'worker_stale:'||current_date::text,'sms_worker_stale'
 FROM public.sms_settings WHERE id AND (worker_at IS NULL OR worker_at<now()-interval '5 minutes')
 ON CONFLICT DO NOTHING;
 PERFORM net.http_post(url=>endpoint,headers=>jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body=>'{}'::jsonb,timeout_milliseconds=>60000);
END $$;
REVOKE ALL ON FUNCTION public.sms_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sms_tick() TO service_role;
SELECT cron.schedule('secure-cleaning-sms','* * * * *','SELECT public.sms_tick();');
COMMIT;
