-- Confirmation emails only; preserve sent history and provider retry payloads.
-- Apply before the application update. No emails or SMS are sent by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.sms_record_inspection_email(p_entity_type text,p_entity_ref text,p_kind text,
 p_phone text,p_recipient text,p_snapshot jsonb,p_provider_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE c jsonb; e uuid; s public.sms_settings%ROWTYPE; why text; z text; m text; template text; j uuid;
BEGIN
 -- Older application instances may still report a pending email during rollout.
 -- Acknowledging that receipt is a no-op: no receipt, job or alert is created.
 IF p_entity_type='booking' AND p_kind='request' THEN RETURN true; END IF;
 IF p_entity_type NOT IN ('booking','sale_inspection') OR p_kind IS DISTINCT FROM 'confirmation'
    OR nullif(trim(p_provider_message_id),'') IS NULL THEN RETURN false; END IF;
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
 template:=CASE WHEN p_entity_type='sale_inspection' THEN 'Secure Cleaning: We''ve emailed your cleaning site induction confirmation. Please let us know if you need to change it. Check your inbox/junk folder for details. Reply STOP to opt out.'
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

CREATE OR REPLACE FUNCTION public.sms_inspection_block_reason(p_receipt uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.sms_inspection_emails%ROWTYPE; c jsonb;
BEGIN
 SELECT * INTO e FROM public.sms_inspection_emails WHERE id=p_receipt;
 IF NOT FOUND OR nullif(trim(e.provider_message_id),'') IS NULL THEN RETURN 'email_not_confirmed'; END IF;
 IF e.kind='request' THEN RETURN 'inspection_request_sms_disabled'; END IF;
 c:=public.sms_inspection_context(e.entity_type,e.entity_ref);
 IF c IS NULL OR c->'snapshot' IS DISTINCT FROM e.snapshot THEN RETURN 'inspection_changed_or_removed'; END IF;
 IF c->>'mobile' IS DISTINCT FROM e.mobile OR c->>'recipient' IS DISTINCT FROM e.recipient THEN RETURN 'inspection_contact_changed'; END IF;
 IF (c->>'startsAt')::timestamptz<=now() THEN RETURN 'inspection_passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_quote_requests r WHERE r.quote_ref=c->>'quoteRef' AND r.mobile=e.mobile AND NOT r.allowed) THEN RETURN 'quote_email_only'; END IF;
 RETURN NULL;
END $$;

-- Cancel only pending request notices which have never reached provider submission.
-- Unknown or in-flight outcomes retain their reconciliation history; the dispatch
-- guard above also prevents another request send when an outcome is reviewed.
UPDATE public.sms_jobs SET status='cancelled',cancel_requested=true,
 reason='inspection_request_sms_disabled',lease_token=NULL,lease_until=NULL,updated_at=now()
WHERE purpose='inspection_request' AND entity_type='booking'
 AND first_attempt_at IS NULL AND status IN ('queued','leased');

REVOKE ALL ON FUNCTION public.sms_record_inspection_email(text,text,text,text,text,jsonb,text), public.sms_inspection_block_reason(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_record_inspection_email(text,text,text,text,text,jsonb,text), public.sms_inspection_block_reason(uuid) TO service_role;
COMMIT;
