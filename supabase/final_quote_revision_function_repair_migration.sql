-- Repair the production final-quote revision function after its JSON field
-- validation identifiers were corrupted. The function remains service-role only.

CREATE OR REPLACE FUNCTION public.revise_final_quote_document(
  p_quote_ref TEXT,
  p_expected_document_version INTEGER,
  p_inspection_report JSONB,
  p_firm_quote_draft JSONB,
  p_final_document JSONB,
  p_actor JSONB,
  p_reviewed_at TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  q public.quotes%ROWTYPE;
  next_version INTEGER;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR q.final_quote_document IS NULL OR q.final_quote_document_version <> p_expected_document_version THEN
    RETURN NULL;
  END IF;
  IF q.firm_quote_workflow->>'status' = 'accepted' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_send_attempts
    WHERE quote_ref = p_quote_ref
      AND document_version = p_expected_document_version
      AND status IN ('claimed', 'provider_accepted')
  ) THEN
    RETURN NULL;
  END IF;

  next_version := p_expected_document_version + 1;
  IF p_reviewed_at IS NULL OR p_actor IS NULL OR
     p_actor->>'kind' NOT IN ('staff_account', 'agent_session') OR
     NULLIF(BTRIM(p_actor->>'id'), '') IS NULL OR NULLIF(BTRIM(p_actor->>'name'), '') IS NULL OR
     p_firm_quote_draft->>'status' <> 'reviewed' OR
     p_final_document->>'variant' <> 'final' OR
     COALESCE((p_final_document->>'version')::INTEGER, 0) <> next_version OR
     p_final_document->'firmQuoteDraft'->>'status' <> 'reviewed' OR
     p_final_document->'firmQuoteDraft' IS DISTINCT FROM p_firm_quote_draft OR
     p_final_document->'inputs' IS DISTINCT FROM p_firm_quote_draft->'revisedInputs' OR
     p_final_document->'reviewedBy' IS DISTINCT FROM p_actor OR
     COALESCE((p_final_document->'firmQuoteDraft'->>'finalPerVisit')::NUMERIC, 0) <= 0 OR
     jsonb_typeof(p_final_document->'firmQuoteDraft'->'roomItems') <> 'array' OR
     jsonb_array_length(p_final_document->'firmQuoteDraft'->'roomItems') = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.quotes SET
    status = 'pending',
    inspection_report = p_inspection_report,
    firm_quote_workflow = p_firm_quote_draft,
    final_quote_document = p_final_document,
    final_quote_document_version = next_version,
    final_quote_reviewed_at = p_reviewed_at,
    final_quote_reviewed_by = p_actor,
    final_quote_sent_at = NULL,
    final_quote_sent_by = NULL,
    final_quote_sent_to = NULL,
    final_quote_sent_variant = NULL,
    updated_at = p_reviewed_at
  WHERE quote_ref = p_quote_ref
    AND final_quote_document_version = p_expected_document_version;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('quote', p_quote_ref, 'final_quote_revised', jsonb_build_object(
    'previousDocumentVersion', p_expected_document_version,
    'documentVersion', next_version,
    'reviewedAt', p_reviewed_at,
    'actor', p_actor
  ));

  RETURN next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
