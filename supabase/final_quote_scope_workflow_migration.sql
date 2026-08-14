-- Secure Cleaning - authoritative final quote document and durable send attempts

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_document JSONB;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_document_version INTEGER;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_reviewed_by JSONB;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_sent_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_sent_by JSONB;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_sent_to TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_quote_sent_variant TEXT;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_final_quote_sent_variant_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_final_quote_sent_variant_check
  CHECK (final_quote_sent_variant IS NULL OR final_quote_sent_variant = 'final');
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_final_quote_document_version_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_final_quote_document_version_check
  CHECK ((final_quote_document IS NULL AND final_quote_document_version IS NULL) OR
         (final_quote_document IS NOT NULL AND final_quote_document_version > 0));

CREATE TABLE IF NOT EXISTS public.quote_send_attempts (
  id UUID PRIMARY KEY,
  quote_ref TEXT NOT NULL REFERENCES public.quotes(quote_ref) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'provider_accepted', 'finalized', 'failed')),
  actor JSONB NOT NULL,
  recipient TEXT NOT NULL,
  document_variant TEXT NOT NULL CHECK (document_variant = 'final'),
  document_version INTEGER NOT NULL CHECK (document_version > 0),
  provider_message_id TEXT,
  failure_stage TEXT CHECK (failure_stage IS NULL OR failure_stage IN ('provider_rejected', 'internal_before_provider')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_accepted_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_send_attempts_unresolved
  ON public.quote_send_attempts(quote_ref, document_version)
  WHERE status IN ('claimed', 'provider_accepted');
CREATE INDEX IF NOT EXISTS idx_quote_send_attempts_reconciliation
  ON public.quote_send_attempts(status, claimed_at);

ALTER TABLE public.quote_send_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access — quote_send_attempts" ON public.quote_send_attempts;
CREATE POLICY "Service role full access — quote_send_attempts"
  ON public.quote_send_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN public.quotes.final_quote_document IS
  'Immutable versioned final document snapshot created when the workflow is reviewed.';
COMMENT ON TABLE public.quote_send_attempts IS
  'Durable final-quote delivery attempts. Claimed or provider-accepted attempts require reconciliation and are never auto-resent.';

CREATE OR REPLACE FUNCTION public.protect_final_quote_document()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.final_quote_document IS NOT NULL AND (
    NEW.final_quote_document IS DISTINCT FROM OLD.final_quote_document OR
    NEW.final_quote_document_version IS DISTINCT FROM OLD.final_quote_document_version OR
    NEW.final_quote_reviewed_at IS DISTINCT FROM OLD.final_quote_reviewed_at OR
    NEW.final_quote_reviewed_by IS DISTINCT FROM OLD.final_quote_reviewed_by
  ) THEN
    RAISE EXCEPTION 'reviewed final quote document is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_final_quote_document ON public.quotes;
CREATE TRIGGER trg_protect_final_quote_document BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.protect_final_quote_document();

CREATE OR REPLACE FUNCTION public.claim_final_quote_send(
  p_attempt_id UUID,
  p_quote_ref TEXT,
  p_actor JSONB,
  p_recipient TEXT,
  p_document_version INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE q public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR q.final_quote_sent_at IS NOT NULL OR q.final_quote_document IS NULL OR
     q.final_quote_document_version <> p_document_version OR
     q.firm_quote_workflow->>'status' <> 'reviewed' OR
     COALESCE((q.final_quote_document->'firmQuoteDraft'->>'finalPerVisit')::NUMERIC, 0) <= 0 OR
     LOWER(BTRIM(q.final_quote_document->'inputs'->>'email')) <> p_recipient THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (SELECT 1 FROM public.quote_send_attempts
             WHERE quote_ref = p_quote_ref AND document_version = p_document_version
               AND status IN ('claimed', 'provider_accepted', 'finalized')) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.quote_send_attempts(id, quote_ref, status, actor, recipient, document_variant, document_version)
  VALUES (p_attempt_id, p_quote_ref, 'claimed', p_actor, p_recipient, 'final', p_document_version);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_final_quote_send(
  p_quote_ref TEXT,
  p_attempt_id UUID,
  p_document_version INTEGER,
  p_sent_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE attempt public.quote_send_attempts%ROWTYPE;
BEGIN
  SELECT * INTO attempt FROM public.quote_send_attempts
  WHERE id = p_attempt_id AND quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR attempt.status <> 'provider_accepted' OR attempt.document_variant <> 'final' OR
     attempt.document_version <> p_document_version THEN RETURN FALSE; END IF;

  UPDATE public.quotes
  SET status = 'sent',
      firm_quote_workflow = jsonb_set(COALESCE(firm_quote_workflow, '{}'::jsonb), '{status}', '"sent"'::jsonb, true),
      final_quote_sent_at = p_sent_at,
      final_quote_sent_by = attempt.actor,
      final_quote_sent_to = attempt.recipient,
      final_quote_sent_variant = 'final',
      updated_at = p_sent_at
  WHERE quote_ref = p_quote_ref AND final_quote_sent_at IS NULL AND final_quote_document IS NOT NULL
    AND final_quote_document_version = p_document_version
    AND firm_quote_workflow->>'status' = 'reviewed'
    AND LOWER(BTRIM(final_quote_document->'inputs'->>'email')) = attempt.recipient
    AND COALESCE((final_quote_document->'firmQuoteDraft'->>'finalPerVisit')::NUMERIC, 0) > 0;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE public.quote_send_attempts SET status = 'finalized', finalized_at = p_sent_at WHERE id = p_attempt_id;
  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('quote', p_quote_ref, 'final_quote_sent', jsonb_build_object(
    'sentAt', p_sent_at, 'actor', attempt.actor, 'recipient', attempt.recipient,
    'documentVariant', 'final', 'documentVersion', attempt.document_version,
    'providerMessageId', attempt.provider_message_id, 'sendAttemptId', attempt.id));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_final_quote_send(
  p_quote_ref TEXT,
  p_attempt_id UUID,
  p_resolution TEXT,
  p_evidence TEXT,
  p_actor JSONB,
  p_provider_message_id TEXT,
  p_reconciled_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE attempt public.quote_send_attempts%ROWTYPE;
BEGIN
  IF p_resolution NOT IN ('confirmed_rejected', 'confirmed_accepted') OR LENGTH(BTRIM(p_evidence)) < 10 THEN RETURN NULL; END IF;
  SELECT * INTO attempt FROM public.quote_send_attempts
  WHERE id = p_attempt_id AND quote_ref = p_quote_ref AND status IN ('claimed', 'provider_accepted') FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_resolution = 'confirmed_rejected' THEN
    UPDATE public.quote_send_attempts SET status = 'failed', failure_stage = 'provider_rejected', failed_at = p_reconciled_at
    WHERE id = p_attempt_id AND status IN ('claimed', 'provider_accepted');
    INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
    VALUES ('quote', p_quote_ref, 'final_quote_send_reconciled', jsonb_build_object(
      'resolution', p_resolution, 'evidence', p_evidence, 'reconciledBy', p_actor, 'sendAttemptId', p_attempt_id));
    RETURN 'failed';
  END IF;

  UPDATE public.quotes SET status = 'sent',
    firm_quote_workflow = jsonb_set(COALESCE(firm_quote_workflow, '{}'::jsonb), '{status}', '"sent"'::jsonb, true),
    final_quote_sent_at = COALESCE(attempt.provider_accepted_at, p_reconciled_at), final_quote_sent_by = attempt.actor,
    final_quote_sent_to = attempt.recipient, final_quote_sent_variant = 'final', updated_at = p_reconciled_at
  WHERE quote_ref = p_quote_ref AND final_quote_sent_at IS NULL AND final_quote_document IS NOT NULL
    AND final_quote_document_version = attempt.document_version AND firm_quote_workflow->>'status' = 'reviewed'
    AND LOWER(BTRIM(final_quote_document->'inputs'->>'email')) = attempt.recipient
    AND COALESCE((final_quote_document->'firmQuoteDraft'->>'finalPerVisit')::NUMERIC, 0) > 0;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.quote_send_attempts SET status = 'finalized', finalized_at = p_reconciled_at,
    provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
    provider_accepted_at = COALESCE(provider_accepted_at, p_reconciled_at) WHERE id = p_attempt_id;
  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('quote', p_quote_ref, 'final_quote_send_reconciled', jsonb_build_object(
    'resolution', p_resolution, 'evidence', p_evidence, 'reconciledBy', p_actor, 'sendAttemptId', p_attempt_id,
    'providerMessageId', COALESCE(p_provider_message_id, attempt.provider_message_id)));
  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('quote', p_quote_ref, 'final_quote_sent', jsonb_build_object(
    'sentAt', COALESCE(attempt.provider_accepted_at, p_reconciled_at), 'actor', attempt.actor, 'recipient', attempt.recipient,
    'documentVariant', 'final', 'documentVersion', attempt.document_version, 'sendAttemptId', p_attempt_id,
    'reconciled', true));
  RETURN 'sent';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_final_quote_document() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) TO service_role;
