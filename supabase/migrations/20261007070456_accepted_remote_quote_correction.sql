-- Owner-only first final correction for an accepted remote quote.
-- Apply after accepted_final_quote_revision_status_cast_repair.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.correct_accepted_remote_quote(
 p_quote_ref TEXT, p_expected_updated_at TIMESTAMPTZ,
 p_inspection_report JSONB, p_firm_quote_draft JSONB,
 p_final_document JSONB, p_actor JSONB, p_reviewed_at TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE;
BEGIN
 IF p_actor->>'kind' IS DISTINCT FROM 'staff_account' OR NOT EXISTS (
   SELECT 1 FROM public.admin_staff_accounts a
   WHERE a.id::TEXT = p_actor->>'id' AND a.active AND a.role::TEXT = 'owner'
 ) THEN RAISE EXCEPTION 'Only an active owner can correct an accepted quote' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_ref=p_quote_ref FOR UPDATE;
 IF NOT FOUND OR p_expected_updated_at IS NULL OR q.updated_at IS DISTINCT FROM p_expected_updated_at
   OR q.final_quote_document IS NOT NULL OR COALESCE(q.final_quote_document_version,0) <> 0
   OR NOT (q.status::TEXT = 'accepted' OR COALESCE(q.firm_quote_workflow->>'status','') = 'accepted') THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.quote_send_attempts WHERE quote_ref=p_quote_ref AND status IN ('claimed','provider_accepted')) THEN RETURN NULL; END IF;
 IF p_reviewed_at IS NULL OR NULLIF(BTRIM(p_actor->>'name'),'') IS NULL
   OR p_firm_quote_draft->>'status' IS DISTINCT FROM 'accepted'
   OR p_final_document->>'variant' IS DISTINCT FROM 'final'
   OR p_final_document->>'version' IS DISTINCT FROM '1'
   OR p_final_document->'firmQuoteDraft' IS DISTINCT FROM p_firm_quote_draft
   OR p_final_document->'inputs' IS DISTINCT FROM p_firm_quote_draft->'revisedInputs'
   OR p_final_document->'reviewedBy' IS DISTINCT FROM p_actor
   OR COALESCE((p_firm_quote_draft->>'finalPerVisit')::NUMERIC,0) <= 0
   OR jsonb_typeof(p_firm_quote_draft->'roomItems') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
 IF jsonb_array_length(p_firm_quote_draft->'roomItems') = 0 THEN RETURN NULL; END IF;
 -- Preserve the pre-correction workflow in private audit history; original inputs/result stay intact.
 INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
 VALUES ('quote',p_quote_ref,'accepted_remote_quote_corrected',jsonb_build_object(
   'actor',p_actor,'documentVersion',1,'previousStatus',q.status,
   'previousWorkflow',q.firm_quote_workflow,'previousInspectionReport',q.inspection_report,
   'previousUpdatedAt',q.updated_at,'preservedAcceptance',true));
 UPDATE public.quotes SET status='accepted'::public.quote_status,
   inspection_report=p_inspection_report,firm_quote_workflow=p_firm_quote_draft,
   final_quote_document=p_final_document,final_quote_document_version=1,
   final_quote_reviewed_at=p_reviewed_at,final_quote_reviewed_by=p_actor,
   final_quote_sent_at=NULL,final_quote_sent_by=NULL,final_quote_sent_to=NULL,final_quote_sent_variant=NULL,
   updated_at=p_reviewed_at
 WHERE quote_ref=p_quote_ref;
 RETURN 1;
END;
$$;
REVOKE ALL ON FUNCTION public.correct_accepted_remote_quote(TEXT,TIMESTAMPTZ,JSONB,JSONB,JSONB,JSONB,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_accepted_remote_quote(TEXT,TIMESTAMPTZ,JSONB,JSONB,JSONB,JSONB,TIMESTAMPTZ) TO service_role;
COMMIT;
