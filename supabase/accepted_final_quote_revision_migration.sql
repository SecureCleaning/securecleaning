-- Allow deliberate, versioned corrections to accepted final quotes.
-- The accepted state is preserved, the previous document is archived by the
-- document guard, and existing downstream contract records are left unchanged.

CREATE OR REPLACE FUNCTION public.protect_final_quote_document()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  is_versioned_revision BOOLEAN;
  preserves_acceptance BOOLEAN;
BEGIN
  IF OLD.final_quote_document IS NOT NULL AND (
    NEW.final_quote_document IS DISTINCT FROM OLD.final_quote_document OR
    NEW.final_quote_document_version IS DISTINCT FROM OLD.final_quote_document_version OR
    NEW.final_quote_reviewed_at IS DISTINCT FROM OLD.final_quote_reviewed_at OR
    NEW.final_quote_reviewed_by IS DISTINCT FROM OLD.final_quote_reviewed_by
  ) THEN
    preserves_acceptance := OLD.status = 'accepted' OR OLD.firm_quote_workflow->>'status' = 'accepted';
    is_versioned_revision :=
      NEW.final_quote_document IS NOT NULL AND
      NEW.final_quote_document_version = OLD.final_quote_document_version + 1 AND
      COALESCE((NEW.final_quote_document->>'version')::INTEGER, 0) = NEW.final_quote_document_version AND
      NEW.final_quote_document->>'variant' = 'final' AND
      NEW.final_quote_document->'firmQuoteDraft'->>'status' = NEW.firm_quote_workflow->>'status' AND
      (
        (preserves_acceptance AND NEW.status = 'accepted' AND NEW.firm_quote_workflow->>'status' = 'accepted') OR
        (NOT preserves_acceptance AND NEW.status = 'pending' AND NEW.firm_quote_workflow->>'status' = 'reviewed')
      ) AND
      NEW.final_quote_reviewed_at IS NOT NULL AND
      NEW.final_quote_reviewed_by IS NOT NULL AND
      NEW.final_quote_sent_at IS NULL AND
      NEW.final_quote_sent_by IS NULL AND
      NEW.final_quote_sent_to IS NULL AND
      NEW.final_quote_sent_variant IS NULL;

    IF NOT is_versioned_revision THEN
      RAISE EXCEPTION 'reviewed final quote document is immutable';
    END IF;

    INSERT INTO public.quote_final_document_versions (
      quote_ref, document_version, document, reviewed_at, reviewed_by,
      sent_at, sent_by, sent_to, sent_variant, superseded_at, superseded_by
    ) VALUES (
      OLD.quote_ref, OLD.final_quote_document_version, OLD.final_quote_document,
      OLD.final_quote_reviewed_at, OLD.final_quote_reviewed_by,
      OLD.final_quote_sent_at, OLD.final_quote_sent_by, OLD.final_quote_sent_to,
      OLD.final_quote_sent_variant, NEW.final_quote_reviewed_at, NEW.final_quote_reviewed_by
    )
    ON CONFLICT (quote_ref, document_version) DO UPDATE SET
      document = EXCLUDED.document,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_by = EXCLUDED.reviewed_by,
      sent_at = EXCLUDED.sent_at,
      sent_by = EXCLUDED.sent_by,
      sent_to = EXCLUDED.sent_to,
      sent_variant = EXCLUDED.sent_variant,
      superseded_at = EXCLUDED.superseded_at,
      superseded_by = EXCLUDED.superseded_by;
  END IF;
  RETURN NEW;
END;
$$;

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
  preserves_acceptance BOOLEAN;
  required_workflow_status TEXT;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR q.final_quote_document IS NULL OR q.final_quote_document_version <> p_expected_document_version THEN
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

  preserves_acceptance := q.status = 'accepted' OR q.firm_quote_workflow->>'status' = 'accepted';
  required_workflow_status := CASE WHEN preserves_acceptance THEN 'accepted' ELSE 'reviewed' END;
  next_version := p_expected_document_version + 1;

  IF p_reviewed_at IS NULL OR p_actor IS NULL OR
     p_actor->>'kind' NOT IN ('staff_account', 'agent_session') OR
     NULLIF(BTRIM(p_actor->>'id'), '') IS NULL OR NULLIF(BTRIM(p_actor->>'name'), '') IS NULL OR
     p_firm_quote_draft->>'status' <> required_workflow_status OR
     p_final_document->>'variant' <> 'final' OR
     COALESCE((p_final_document->>'version')::INTEGER, 0) <> next_version OR
     p_final_document->'firmQuoteDraft'->>'status' <> required_workflow_status OR
     p_final_document->'firmQuoteDraft' IS DISTINCT FROM p_firm_quote_draft OR
     p_final_document->'inputs' IS DISTINCT FROM p_firm_quote_draft->'revisedInputs' OR
     p_final_document->'reviewedBy' IS DISTINCT FROM p_actor OR
     COALESCE((p_final_document->'firmQuoteDraft'->>'finalPerVisit')::NUMERIC, 0) <= 0 OR
     jsonb_typeof(p_final_document->'firmQuoteDraft'->'roomItems') <> 'array' OR
     jsonb_array_length(p_final_document->'firmQuoteDraft'->'roomItems') = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.quotes SET
    status = CASE WHEN preserves_acceptance THEN 'accepted' ELSE 'pending' END,
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
    'actor', p_actor,
    'preservedAcceptance', preserves_acceptance
  ));

  RETURN next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revise_final_quote_document(TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
