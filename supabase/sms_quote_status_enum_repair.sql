-- Quote status is a constrained enum. SMS terminal-state checks also include
-- workflow-only values, so compare the enum as text rather than coercing every
-- candidate into public.quote_status.

CREATE OR REPLACE FUNCTION public.sms_cancel_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     NEW.status::text IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') OR
     NEW.firm_quote_workflow->>'status' IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') OR
     NEW.final_quote_document_version IS DISTINCT FROM OLD.final_quote_document_version THEN
    UPDATE public.sms_jobs
    SET cancel_requested = true,
        status = CASE WHEN first_attempt_at IS NULL THEN 'cancelled' ELSE status END,
        reason = 'quote_changed_or_removed', updated_at = now()
    WHERE quote_ref = OLD.quote_ref
      AND status IN ('queued', 'leased', 'submitting', 'unknown', 'review');
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_dispatch(p_id uuid, p_token uuid, p_message text, p_payload jsonb, p_scope text)
RETURNS SETOF public.sms_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  j public.sms_jobs%ROWTYPE;
  q public.quotes%ROWTYPE;
  pref public.sms_preferences%ROWTYPE;
  s public.sms_settings%ROWTYPE;
  why text;
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
  ELSIF j.purpose <> 'test' AND NOT coalesce(pref.consent, false) THEN why := 'sms_consent_missing';
  ELSIF public.sms_next_time(now(), j.time_zone) > now() THEN
    UPDATE public.sms_jobs SET status = 'queued', due_at = public.sms_next_time(now(), j.time_zone),
      lease_token = NULL, lease_until = NULL WHERE id = j.id;
    RETURN;
  ELSIF j.created_at < now() - interval '7 days' OR j.expires_at < now() THEN why := 'reminder_stale';
  END IF;
  IF j.entity_type = 'quote' THEN
    SELECT * INTO q FROM public.quotes WHERE quote_ref = j.quote_ref FOR UPDATE;
    IF NOT FOUND OR q.valid_until < now() OR q.final_quote_document_version IS DISTINCT FROM j.document_version OR
       q.status::text IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') OR
       q.firm_quote_workflow->>'status' IN ('accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled') THEN
      why := 'quote_changed_or_removed';
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
  IF j.first_attempt_at IS NULL AND EXISTS (
    SELECT 1 FROM public.sms_jobs other WHERE other.id <> j.id AND other.mobile = j.mobile AND
      (other.status IN ('submitting', 'unknown', 'review') OR
       (other.first_attempt_at > now() - CASE WHEN j.automatic THEN interval '24 hours' ELSE interval '1 minute' END AND
        other.status IN ('submitted', 'delivered')))
  ) THEN why := 'recipient_cooldown'; END IF;
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

REVOKE ALL ON FUNCTION public.sms_cancel_quote() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_cancel_quote() TO service_role;
REVOKE ALL ON FUNCTION public.sms_dispatch(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_dispatch(uuid, uuid, text, jsonb, text) TO service_role;
