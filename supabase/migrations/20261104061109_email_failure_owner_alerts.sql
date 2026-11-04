BEGIN;

-- Owner alerts only: no original email bodies, attachments, credentials or raw errors.
CREATE TABLE IF NOT EXISTS public.email_failure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK (dedupe_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('not_sent','provider_rejected','uncertain')),
  failure_code text NOT NULL CHECK (failure_code ~ '^[a-z0-9_]{1,80}$'),
  alert_text text NOT NULL CHECK (length(alert_text) BETWEEN 1 AND 5000),
  recipient text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','review')),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  provider_id text,
  sent_at timestamptz
);
ALTER TABLE public.email_failure_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_failure_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_failure_alerts TO service_role;
CREATE INDEX IF NOT EXISTS email_failure_alerts_pending ON public.email_failure_alerts(next_attempt_at) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.claim_email_failure_alerts(p_recipient text, p_limit integer DEFAULT 3, p_id uuid DEFAULT NULL)
RETURNS SETOF public.email_failure_alerts
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF p_recipient IS NULL OR length(p_recipient)>254 OR p_recipient ~ '[[:space:]<>]' OR
     p_recipient !~ '^[^@]+@[^@]+[.][^@]+$' THEN
    RAISE EXCEPTION 'Invalid owner notification address';
  END IF;
  -- Resend retains idempotency keys for 24 hours. Stop before that limit so an
  -- uncertain alert cannot be duplicated. Original customer messages are never retried here.
  UPDATE public.email_failure_alerts SET status='review',lease_token=NULL,lease_until=NULL
    WHERE status='pending' AND first_attempt_at < now()-interval '23 hours'
      AND (lease_until IS NULL OR lease_until < now()) AND (p_id IS NULL OR id=p_id);
  RETURN QUERY
    WITH candidates AS (
      SELECT id FROM public.email_failure_alerts
      WHERE status='pending' AND next_attempt_at<=now()
        AND (lease_until IS NULL OR lease_until<now()) AND (p_id IS NULL OR id=p_id)
      ORDER BY created_at,id LIMIT greatest(1,least(coalesce(p_limit,3),3))
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_failure_alerts a SET
      recipient=coalesce(a.recipient,p_recipient),
      first_attempt_at=coalesce(a.first_attempt_at,now()),
      attempts=a.attempts+1, lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute',
      next_attempt_at=now()+interval '5 minutes'
    FROM candidates c WHERE a.id=c.id RETURNING a.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_email_failure_alerts(text,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_failure_alerts(text,integer,uuid) TO service_role;

COMMIT;
