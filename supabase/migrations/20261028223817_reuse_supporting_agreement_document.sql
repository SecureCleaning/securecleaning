-- Reuse existing supporting evidence through the same audited correction transaction.
CREATE OR REPLACE FUNCTION public.correct_contract_sale_agreement_document(
 p_actor_id uuid,p_sale_id uuid,p_agreement_id uuid,p_action text,p_reason text,
 p_expected_revision integer,p_expected_path text,p_file_name text DEFAULT NULL,p_storage_path text DEFAULT NULL,p_target_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a contract_sale_agreements%ROWTYPE; staff admin_staff_accounts%ROWTYPE; before_doc jsonb; after_doc jsonb; eid uuid; target contract_sale_agreement_document_events%ROWTYPE;
BEGIN
 SELECT * INTO staff FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text IN ('owner','manager');
 IF NOT FOUND THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM contract_product_sales WHERE id=p_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
 SELECT * INTO a FROM contract_sale_agreements WHERE id=p_agreement_id AND sale_id=p_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
 IF a.document_revision IS DISTINCT FROM p_expected_revision OR a.signed_storage_path IS DISTINCT FROM p_expected_path THEN RAISE EXCEPTION 'Documents changed. Refresh and review before retrying.'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('replace','remove','support','remove_support') OR coalesce(length(trim(p_reason)),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Choose an action and enter a correction reason.'; END IF;
 IF p_action IN ('replace','remove') AND a.status='void' THEN RAISE EXCEPTION 'Voided agreements cannot be corrected.'; END IF;
 -- Reuse only an active supporting PDF from this exact agreement. Never trust a client path.
 IF p_action='replace' AND p_target_id IS NOT NULL THEN
  SELECT * INTO target FROM contract_sale_agreement_document_events WHERE id=p_target_id AND agreement_id=a.id AND sale_id=p_sale_id AND action='support';
  IF NOT FOUND OR EXISTS(SELECT 1 FROM contract_sale_agreement_document_events WHERE target_id=p_target_id AND action='remove_support') THEN RAISE EXCEPTION 'Supporting document is missing or already removed.'; END IF;
  p_file_name:=target.after_evidence->>'file_name';
  p_storage_path:=target.after_evidence->>'storage_path';
 END IF;
 IF p_action IN ('replace','support') AND (nullif(trim(p_file_name),'') IS NULL OR p_storage_path IS NULL OR p_storage_path NOT LIKE p_sale_id::text||'/'||p_agreement_id::text||'/%') THEN RAISE EXCEPTION 'Upload a PDF for this agreement.'; END IF;
 IF p_action='remove' AND a.signed_storage_path IS NULL THEN RAISE EXCEPTION 'No signed upload to remove.'; END IF;
 -- Replacement after removal is allowed, but this is not the first-signature workflow.
 IF p_action='replace' AND a.signed_storage_path IS NULL AND NOT EXISTS(SELECT 1 FROM contract_sale_agreement_document_events WHERE agreement_id=a.id AND action='remove') THEN RAISE EXCEPTION 'Use Upload signed PDF for the first signature.'; END IF;
 before_doc:=jsonb_build_object('status',a.status,'signed_at',a.signed_at,'file_name',a.signed_file_name,'storage_path',a.signed_storage_path);
 after_doc:=before_doc;
 IF p_action='replace' THEN after_doc:=jsonb_build_object('status','signed','signed_at',coalesce(a.signed_at,now()),'file_name',p_file_name,'storage_path',p_storage_path);
 ELSIF p_action='remove' THEN after_doc:=jsonb_build_object('status','sent','signed_at',NULL,'file_name',NULL,'storage_path',NULL);
 ELSIF p_action='support' THEN before_doc:='{}'; after_doc:=jsonb_build_object('file_name',p_file_name,'storage_path',p_storage_path);
 ELSIF p_action='remove_support' THEN
  SELECT * INTO target FROM contract_sale_agreement_document_events WHERE id=p_target_id AND agreement_id=a.id AND sale_id=p_sale_id AND action='support';
  IF NOT FOUND OR EXISTS(SELECT 1 FROM contract_sale_agreement_document_events WHERE target_id=p_target_id AND action='remove_support') THEN RAISE EXCEPTION 'Supporting document is missing or already removed.'; END IF;
  before_doc:=target.after_evidence; after_doc:='{}';
 END IF;
 INSERT INTO contract_sale_agreement_document_events(sale_id,agreement_id,action,reason,actor_id,actor_name,target_id,before_evidence,after_evidence)
 VALUES(p_sale_id,a.id,p_action,trim(p_reason),p_actor_id,staff.username,CASE WHEN p_action IN ('remove_support','replace') THEN p_target_id END,before_doc,after_doc) RETURNING id INTO eid;
 IF p_action IN ('replace','remove') THEN
  UPDATE contract_sale_agreements SET status=after_doc->>'status',signed_at=(after_doc->>'signed_at')::timestamptz,signed_file_name=after_doc->>'file_name',signed_storage_path=after_doc->>'storage_path',document_revision=document_revision+1,document_correction_pending=(p_action='remove') WHERE id=a.id;
 ELSE
  UPDATE contract_sale_agreements SET document_revision=document_revision+1 WHERE id=a.id;
 END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('contract_sale',p_sale_id::text,'contract_sale.agreement.document.'||p_action,jsonb_build_object('actorId',p_actor_id,'agreementId',a.id,'documentEventId',eid,'reason',trim(p_reason)));
 RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.correct_contract_sale_agreement_document(uuid,uuid,uuid,text,text,integer,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_contract_sale_agreement_document(uuid,uuid,uuid,text,text,integer,text,text,text,uuid) TO service_role;
