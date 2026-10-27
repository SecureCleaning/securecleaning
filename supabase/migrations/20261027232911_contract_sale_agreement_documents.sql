-- Private, append-only document corrections. Original PDFs remain in private storage.
ALTER TABLE public.contract_sale_agreements ADD COLUMN document_revision integer NOT NULL DEFAULT 0, ADD COLUMN document_correction_pending boolean NOT NULL DEFAULT false;
CREATE TABLE public.contract_sale_agreement_document_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sale_id uuid NOT NULL REFERENCES public.contract_product_sales(id),
 agreement_id uuid NOT NULL REFERENCES public.contract_sale_agreements(id),
 action text NOT NULL CHECK(action IN ('replace','remove','support','remove_support')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),
 actor_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id),
 actor_name text NOT NULL,
 target_id uuid REFERENCES public.contract_sale_agreement_document_events(id),
 before_evidence jsonb NOT NULL,
 after_evidence jsonb NOT NULL,
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contract_sale_agreement_document_events(sale_id,created_at);
ALTER TABLE public.contract_sale_agreement_document_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_sale_agreement_document_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.contract_sale_agreement_document_events TO service_role;
CREATE FUNCTION public.guard_agreement_document_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Document history is immutable.'; END $$;
CREATE TRIGGER guard_agreement_document_history BEFORE UPDATE OR DELETE ON public.contract_sale_agreement_document_events FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_document_history();

CREATE OR REPLACE FUNCTION public.protect_signed_contract_sale_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.purchase_price_inc_gst_cents_snapshot IS DISTINCT FROM NEW.purchase_price_inc_gst_cents_snapshot
    OR OLD.content_snapshot IS DISTINCT FROM NEW.content_snapshot
    OR OLD.cleaner_name_snapshot IS DISTINCT FROM NEW.cleaner_name_snapshot
    OR OLD.cleaner_business_snapshot IS DISTINCT FROM NEW.cleaner_business_snapshot
    OR OLD.cleaner_email_snapshot IS DISTINCT FROM NEW.cleaner_email_snapshot
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.agreement_type IS DISTINCT FROM NEW.agreement_type
    OR ((OLD.status = 'signed' OR OLD.signed_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM public.contract_sale_agreement_document_events e WHERE e.agreement_id=OLD.id AND e.transaction_id=txid_current() AND e.action IN ('replace','remove') AND e.before_evidence=jsonb_build_object('status',OLD.status,'signed_at',OLD.signed_at,'file_name',OLD.signed_file_name,'storage_path',OLD.signed_storage_path) AND e.after_evidence=jsonb_build_object('status',NEW.status,'signed_at',NEW.signed_at,'file_name',NEW.signed_file_name,'storage_path',NEW.signed_storage_path)) AND (
      (NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status='void' AND EXISTS (SELECT 1 FROM public.contract_sale_price_amendments a WHERE a.sale_id=OLD.sale_id AND a.transaction_id=txid_current())))
      OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
      OR NEW.signed_file_name IS DISTINCT FROM OLD.signed_file_name
      OR NEW.signed_storage_path IS DISTINCT FROM OLD.signed_storage_path
    ))
  THEN RAISE EXCEPTION 'Agreement snapshots and signed evidence are immutable.'; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION activate_signed_contract_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.payment_plan_id IS DISTINCT FROM NEW.payment_plan_id THEN RAISE EXCEPTION 'Agreement plan link is immutable.'; END IF;
 IF NEW.payment_plan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE id=NEW.payment_plan_id AND sale_id=NEW.sale_id) THEN RAISE EXCEPTION 'Plan does not belong to agreement sale.'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'document_revision')=(to_jsonb(OLD)-'document_revision') THEN RETURN NEW; END IF;
 -- A correction changes evidence only, never acceptance or financial records.
 IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM public.contract_sale_agreement_document_events e WHERE e.agreement_id=NEW.id AND e.transaction_id=txid_current() AND e.action IN ('replace','remove') AND e.after_evidence=jsonb_build_object('status',NEW.status,'signed_at',NEW.signed_at,'file_name',NEW.signed_file_name,'storage_path',NEW.signed_storage_path)) THEN RETURN NEW; END IF;
 IF NEW.status='signed' AND NEW.payment_plan_id IS NOT NULL THEN
  PERFORM 1 FROM contract_product_sales WHERE id=NEW.sale_id AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cancelled sale cannot activate a payment plan.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE id=NEW.payment_plan_id AND status IN ('awaiting_acceptance','active','completed')) THEN RAISE EXCEPTION 'This payment plan was superseded. Use the latest agreement.'; END IF;
  UPDATE contract_sale_payment_plans SET status='cancelled',updated_at=now() WHERE sale_id=NEW.sale_id AND status='active' AND id<>NEW.payment_plan_id;
  UPDATE contract_sale_payment_plans SET status='active',updated_at=now() WHERE id=NEW.payment_plan_id AND status='awaiting_acceptance';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.correct_contract_sale_agreement_document(
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
 VALUES(p_sale_id,a.id,p_action,trim(p_reason),p_actor_id,staff.username,CASE WHEN p_action='remove_support' THEN p_target_id END,before_doc,after_doc) RETURNING id INTO eid;
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
REVOKE ALL ON FUNCTION public.guard_agreement_document_history() FROM PUBLIC,anon,authenticated;

-- First-signature uploads also advance the revision, preventing stale correction forms.
CREATE FUNCTION public.advance_agreement_document_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.document_revision=OLD.document_revision AND (NEW.signed_storage_path IS DISTINCT FROM OLD.signed_storage_path OR NEW.status IS DISTINCT FROM OLD.status) THEN NEW.document_revision:=OLD.document_revision+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER advance_agreement_document_revision BEFORE UPDATE ON public.contract_sale_agreements FOR EACH ROW EXECUTE FUNCTION public.advance_agreement_document_revision();
REVOKE ALL ON FUNCTION public.advance_agreement_document_revision() FROM PUBLIC,anon,authenticated;

-- An older signed version must not bypass a pending correction at handover.
CREATE FUNCTION public.block_handover_pending_document_correction() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.handover_at IS NULL AND NEW.handover_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.contract_sale_agreements WHERE sale_id=NEW.id AND status<>'void' AND document_correction_pending) THEN
  RAISE EXCEPTION 'Replace the removed signed agreement before completing handover.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER block_handover_pending_document_correction BEFORE UPDATE OF handover_at ON public.contract_product_sales FOR EACH ROW EXECUTE FUNCTION public.block_handover_pending_document_correction();
REVOKE ALL ON FUNCTION public.block_handover_pending_document_correction() FROM PUBLIC,anon,authenticated;
