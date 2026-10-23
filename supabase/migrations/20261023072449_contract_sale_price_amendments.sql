-- Owner-only monetary amendments. Existing invoice IDs/numbers and allocations remain stable.
-- Apply before deploying the sale.amend API. No historical data is rewritten on migration.
BEGIN;
ALTER TABLE public.contract_sale_invoices ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0);
ALTER TABLE public.contract_sale_invoice_email_deliveries ADD COLUMN IF NOT EXISTS invoice_revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.contract_sale_agreements ADD COLUMN IF NOT EXISTS purchase_price_inc_gst_cents_snapshot integer;
CREATE TABLE public.contract_sale_price_amendments (
 id uuid PRIMARY KEY,
 sale_id uuid NOT NULL REFERENCES public.contract_product_sales(id),
 invoice_id uuid NOT NULL REFERENCES public.contract_sale_invoices(id),
 actor_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),
 old_price_cents integer NOT NULL,
 new_price_cents integer NOT NULL CHECK(new_price_cents > 50000),
 confirmed_paid_cents integer NOT NULL,
 invoice_revision integer NOT NULL,
 invoice_before jsonb NOT NULL,
 request_snapshot jsonb NOT NULL,
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(invoice_id,invoice_revision)
);
ALTER TABLE public.contract_sale_price_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_sale_price_amendments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.contract_sale_price_amendments TO service_role;
CREATE OR REPLACE FUNCTION public.guard_contract_sale_price_amendment() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Sale price amendment history is immutable.'; END $$;
CREATE TRIGGER guard_contract_sale_price_amendment BEFORE UPDATE OR DELETE ON public.contract_sale_price_amendments FOR EACH ROW EXECUTE FUNCTION public.guard_contract_sale_price_amendment();
REVOKE ALL ON FUNCTION public.guard_contract_sale_price_amendment() FROM PUBLIC,anon,authenticated;

-- Only a record inserted by the privileged amendment RPC in this transaction permits the
-- exact monetary changes below. Setting a session variable alone cannot unlock snapshots.
CREATE OR REPLACE FUNCTION public.protect_contract_product_sale_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.sale_code IS DISTINCT FROM NEW.sale_code
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id
    OR OLD.opportunity_id IS DISTINCT FROM NEW.opportunity_id
    OR ((OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id OR OLD.deleted_source_quote_ref IS DISTINCT FROM NEW.deleted_source_quote_ref) AND NOT (
      NEW.source_quote_id IS NULL AND
      COALESCE(current_setting('app.deleting_quote_id', true) = OLD.source_quote_id::text, false)
      AND NEW.deleted_source_quote_ref IS NOT NULL
    ))
    OR OLD.site_id IS DISTINCT FROM NEW.site_id
    OR OLD.deposit_inc_gst_cents IS DISTINCT FROM NEW.deposit_inc_gst_cents
    OR OLD.product_snapshot IS DISTINCT FROM NEW.product_snapshot
    OR OLD.cleaner_snapshot IS DISTINCT FROM NEW.cleaner_snapshot
    OR OLD.client_snapshot IS DISTINCT FROM NEW.client_snapshot
    OR OLD.site_snapshot IS DISTINCT FROM NEW.site_snapshot
  THEN
    RAISE EXCEPTION 'Product sale source snapshots are immutable.';
  END IF;

  IF OLD.agreed_purchase_price_inc_gst_cents IS DISTINCT FROM NEW.agreed_purchase_price_inc_gst_cents
    AND NOT EXISTS (SELECT 1 FROM public.contract_sale_price_amendments a WHERE a.sale_id=OLD.id AND a.transaction_id=txid_current() AND a.old_price_cents=OLD.agreed_purchase_price_inc_gst_cents AND a.new_price_cents=NEW.agreed_purchase_price_inc_gst_cents)
    AND (
      OLD.status <> 'draft'
      OR EXISTS (
        SELECT 1 FROM contract_sale_invoices invoice
        WHERE invoice.sale_id = OLD.id AND invoice.status <> 'void'
      )
      OR EXISTS (
        SELECT 1 FROM contract_sale_agreements agreement
        WHERE agreement.sale_id = OLD.id AND agreement.status <> 'void'
      )
    )
  THEN
    RAISE EXCEPTION 'The purchase price cannot change after a tax invoice or agreement snapshot exists.';
  END IF;

  IF OLD.price_finalised_at IS NOT NULL AND NEW.price_finalised_at IS NULL THEN
    RAISE EXCEPTION 'A finalised product-sale price cannot be cleared.';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_contract_sale_invoice_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
    OR OLD.sale_id IS DISTINCT FROM NEW.sale_id
    OR OLD.invoice_type IS DISTINCT FROM NEW.invoice_type
    OR OLD.description_snapshot IS DISTINCT FROM NEW.description_snapshot
    OR ((OLD.total_inc_gst_cents IS DISTINCT FROM NEW.total_inc_gst_cents
      OR OLD.gst_component_cents IS DISTINCT FROM NEW.gst_component_cents
      OR OLD.revision_number IS DISTINCT FROM NEW.revision_number) AND NOT EXISTS (
        SELECT 1 FROM public.contract_sale_price_amendments a WHERE a.invoice_id=OLD.id AND a.transaction_id=txid_current()
        AND a.old_price_cents=OLD.total_inc_gst_cents AND a.new_price_cents=NEW.total_inc_gst_cents
        AND NEW.gst_component_cents=round(NEW.total_inc_gst_cents::numeric/11)::integer
        AND a.invoice_revision=NEW.revision_number AND NEW.revision_number=OLD.revision_number+1))
    OR OLD.deposit_required_inc_gst_cents IS DISTINCT FROM NEW.deposit_required_inc_gst_cents
    OR OLD.due_on IS DISTINCT FROM NEW.due_on
    OR OLD.payment_terms_snapshot IS DISTINCT FROM NEW.payment_terms_snapshot
    OR OLD.recipient_name_snapshot IS DISTINCT FROM NEW.recipient_name_snapshot
    OR OLD.recipient_business_snapshot IS DISTINCT FROM NEW.recipient_business_snapshot
    OR OLD.recipient_email_snapshot IS DISTINCT FROM NEW.recipient_email_snapshot
    OR OLD.recipient_address_snapshot IS DISTINCT FROM NEW.recipient_address_snapshot
    OR OLD.recipient_abn_snapshot IS DISTINCT FROM NEW.recipient_abn_snapshot
    OR OLD.supplier_name_snapshot IS DISTINCT FROM NEW.supplier_name_snapshot
    OR OLD.supplier_abn_snapshot IS DISTINCT FROM NEW.supplier_abn_snapshot
    OR OLD.supplier_email_snapshot IS DISTINCT FROM NEW.supplier_email_snapshot
    OR OLD.invoice_title_snapshot IS DISTINCT FROM NEW.invoice_title_snapshot
    OR OLD.email_subject_template_snapshot IS DISTINCT FROM NEW.email_subject_template_snapshot
    OR OLD.email_intro_template_snapshot IS DISTINCT FROM NEW.email_intro_template_snapshot
    OR OLD.footer_note_snapshot IS DISTINCT FROM NEW.footer_note_snapshot
    OR OLD.bank_account_name_snapshot IS DISTINCT FROM NEW.bank_account_name_snapshot
    OR OLD.bank_name_snapshot IS DISTINCT FROM NEW.bank_name_snapshot
    OR OLD.bank_bsb_snapshot IS DISTINCT FROM NEW.bank_bsb_snapshot
    OR OLD.bank_account_number_snapshot IS DISTINCT FROM NEW.bank_account_number_snapshot
    OR OLD.payment_reference_template_snapshot IS DISTINCT FROM NEW.payment_reference_template_snapshot
    OR OLD.issued_by_staff_id IS DISTINCT FROM NEW.issued_by_staff_id
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
  THEN
    RAISE EXCEPTION 'Issued invoice snapshots are immutable.';
  END IF;

  IF (
    OLD.sender_name_snapshot IS DISTINCT FROM NEW.sender_name_snapshot
    OR OLD.sender_title_snapshot IS DISTINCT FROM NEW.sender_title_snapshot
    OR OLD.sender_email_snapshot IS DISTINCT FROM NEW.sender_email_snapshot
  ) AND (
    OLD.delivery_status NOT IN ('pending', 'failed')
    OR OLD.provider_message_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The invoice sender is immutable after its first delivery.';
  END IF;
  RETURN NEW;
END;
$function$
;
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
    OR ((OLD.status = 'signed' OR OLD.signed_at IS NOT NULL) AND (
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

CREATE OR REPLACE FUNCTION public.amend_contract_sale_price(
 p_actor_id uuid, p_sale_id uuid, p_request_id uuid, p_expected_price integer,
 p_expected_paid integer, p_new_price integer, p_reason text,
 p_instalments jsonb, p_plan_terms text, p_agreement_content text, p_expected_plan_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 s contract_product_sales%ROWTYPE;
 i contract_sale_invoices%ROWTYPE;
 replay contract_sale_price_amendments%ROWTYPE;
 paid integer;
 has_plan boolean;
 plan_id uuid;
 agreement_id uuid := gen_random_uuid();
 request_data jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner') THEN
  RAISE EXCEPTION 'Only the owner can amend a sale price.' USING ERRCODE='42501';
 END IF;
 request_data:=jsonb_build_object('price',p_new_price,'expectedPrice',p_expected_price,'expectedPaid',p_expected_paid,'reason',trim(p_reason),'instalments',p_instalments,'expectedPlanId',p_expected_plan_id);
 SELECT * INTO s FROM contract_product_sales WHERE id=p_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
 SELECT * INTO replay FROM contract_sale_price_amendments WHERE id=p_request_id;
 IF FOUND THEN
  IF replay.sale_id=p_sale_id AND replay.actor_id=p_actor_id AND replay.request_snapshot=request_data THEN RETURN replay.id; END IF;
  RAISE EXCEPTION 'Amendment request was already used for different details.';
 END IF;
 IF s.status IN ('cancelled','completed') OR s.handover_at IS NOT NULL THEN
  RAISE EXCEPTION 'Price amendments must be made before handover. Completed or cancelled sales require a separate accounting adjustment.';
 END IF;
 IF p_new_price IS NULL OR p_new_price<=s.deposit_inc_gst_cents OR p_new_price=s.agreed_purchase_price_inc_gst_cents
    OR coalesce(length(trim(p_reason)),0) NOT BETWEEN 5 AND 1000 OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Enter a changed price greater than the deposit and an amendment reason.';
 END IF;
 IF p_expected_price IS DISTINCT FROM s.agreed_purchase_price_inc_gst_cents THEN RAISE EXCEPTION 'Sale price changed. Refresh and review the amendment.'; END IF;
 IF (SELECT count(*) FROM contract_sale_invoices WHERE sale_id=s.id AND status<>'void')<>1 THEN
  RAISE EXCEPTION 'A single full sale tax invoice is required for a price amendment.';
 END IF;
 SELECT * INTO i FROM contract_sale_invoices WHERE sale_id=s.id AND status<>'void' FOR UPDATE;
 IF i.invoice_type<>'sale' OR i.total_inc_gst_cents<>s.agreed_purchase_price_inc_gst_cents THEN RAISE EXCEPTION 'Legacy or mismatched invoices require a separate accounting adjustment.'; END IF;
 IF EXISTS(SELECT 1 FROM contract_sale_invoice_email_deliveries WHERE invoice_id=i.id AND delivery_status IN ('pending','unknown')) THEN RAISE EXCEPTION 'An invoice email is in progress or unresolved. Resolve its delivery before amending the price.'; END IF;
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM contract_sale_payment_allocations WHERE invoice_id=i.id;
 IF p_expected_paid IS DISTINCT FROM paid THEN RAISE EXCEPTION 'Payments changed. Refresh and review the amendment.'; END IF;
 IF p_new_price<paid THEN RAISE EXCEPTION 'The amended price cannot be below confirmed payments. A refund or credit must be handled separately.'; END IF;
 IF EXISTS(SELECT 1 FROM contract_commission_claims WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM contract_commission_payouts WHERE sale_id=s.id) THEN
  RAISE EXCEPTION 'Commission has already been invoiced or paid. Resolve its accounting adjustment before changing the sale price.';
 END IF;
 SELECT EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE sale_id=s.id AND status IN ('awaiting_acceptance','active','defaulted')) INTO has_plan;
 IF p_expected_plan_id IS DISTINCT FROM (SELECT id FROM contract_sale_payment_plans WHERE sale_id=s.id AND status IN ('awaiting_acceptance','active','defaulted') ORDER BY version DESC LIMIT 1) THEN RAISE EXCEPTION 'Payment plan changed. Refresh and review the amendment.'; END IF;
 IF coalesce(length(trim(p_agreement_content)),0)<100 THEN RAISE EXCEPTION 'A revised purchase agreement is required.'; END IF;
 IF has_plan AND p_new_price>paid AND (p_instalments IS NULL OR jsonb_typeof(p_instalments)<>'array') THEN RAISE EXCEPTION 'Include the replacement payment schedule.'; END IF;
 IF NOT has_plan AND p_instalments IS NOT NULL THEN RAISE EXCEPTION 'Create a new payment plan separately after amending this sale.'; END IF;
 INSERT INTO contract_sale_price_amendments(id,sale_id,invoice_id,actor_id,reason,old_price_cents,new_price_cents,confirmed_paid_cents,invoice_revision,invoice_before,request_snapshot)
 VALUES(p_request_id,s.id,i.id,p_actor_id,trim(p_reason),s.agreed_purchase_price_inc_gst_cents,p_new_price,paid,i.revision_number+1,to_jsonb(i),request_data);
 UPDATE contract_product_sales SET agreed_purchase_price_inc_gst_cents=p_new_price,updated_by_staff_id=p_actor_id,updated_at=now() WHERE id=s.id;
 UPDATE contract_sale_invoices SET total_inc_gst_cents=p_new_price,gst_component_cents=round(p_new_price::numeric/11)::integer,
  revision_number=revision_number+1,status=CASE WHEN paid=p_new_price THEN 'paid' WHEN paid>0 THEN 'part_paid' ELSE 'issued' END,
  delivery_status='pending',provider_message_id=NULL,delivery_error=NULL,updated_at=now() WHERE id=i.id;
 -- Old signed documents and their stored PDF evidence remain archived, but cannot satisfy
 -- handover/inspection gates for the changed price. The new agreement must be accepted.
 UPDATE contract_sale_agreements SET status='void',updated_at=now() WHERE sale_id=s.id AND status<>'void';
 UPDATE contract_sale_payment_plans SET status='cancelled',updated_at=now() WHERE sale_id=s.id AND status IN ('awaiting_acceptance','active','defaulted');
 IF has_plan AND p_new_price>paid THEN
  plan_id:=create_contract_sale_payment_plan(s.id,i.id,p_plan_terms,p_instalments,p_actor_id,'owner',NULL);
 END IF;
 INSERT INTO contract_sale_agreements(id,sale_id,version,agreement_type,payment_plan_id,content_snapshot,cleaner_name_snapshot,cleaner_business_snapshot,cleaner_email_snapshot,created_by_staff_id,purchase_price_inc_gst_cents_snapshot)
 SELECT agreement_id,s.id,coalesce((SELECT max(version)+1 FROM contract_sale_agreements WHERE sale_id=s.id),1),
 CASE WHEN plan_id IS NULL THEN 'standard' ELSE 'payment_plan' END,plan_id,p_agreement_content,
 c.contact_name,coalesce(c.business_name,''),c.email,p_actor_id,p_new_price FROM cleaners c WHERE c.id=s.cleaner_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cleaner record missing.'; END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('contract_sale',s.id::text,'contract_sale.price.amended',
 jsonb_build_object('actorId',p_actor_id,'amendmentId',p_request_id,'oldPriceCents',s.agreed_purchase_price_inc_gst_cents,'newPriceCents',p_new_price,'confirmedPaidCents',paid,'reason',trim(p_reason),'invoiceRevision',i.revision_number+1,'agreementId',agreement_id,'paymentPlanId',plan_id));
 RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.amend_contract_sale_price(uuid,uuid,uuid,integer,integer,integer,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.amend_contract_sale_price(uuid,uuid,uuid,integer,integer,integer,text,jsonb,text,text,uuid) TO service_role;

-- A replacement may contain just the final unpaid instalment.
CREATE OR REPLACE FUNCTION public.create_contract_sale_payment_plan(p_sale_id uuid, p_balance_invoice_id uuid, p_terms_snapshot text, p_instalments jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  sale_row contract_product_sales%ROWTYPE;
  invoice_row contract_sale_invoices%ROWTYPE;
  plan_id UUID := gen_random_uuid();
  schedule_total INTEGER;
  schedule_count INTEGER;
  already_paid INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE
      AND role::TEXT = p_actor_role AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN RAISE EXCEPTION 'Actor is not authorized.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO sale_row FROM contract_product_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF p_actor_role = 'agent' AND (
    NOT EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id = sale_row.product_id AND public.agent_can_access_product_state(p_actor_id, ap.state)) OR NOT EXISTS (
      SELECT 1 FROM contract_products
      WHERE id = sale_row.product_id AND state IS NOT DISTINCT FROM p_actor_state
    )
  ) THEN RAISE EXCEPTION 'Sale not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invoice_row FROM contract_sale_invoices WHERE id = p_balance_invoice_id AND sale_id = p_sale_id FOR SHARE;
  IF NOT FOUND OR invoice_row.invoice_type NOT IN ('sale', 'balance') OR invoice_row.status IN ('paid', 'void') THEN
    RAISE EXCEPTION 'An unpaid sale tax invoice is required.';
  END IF;
  IF sale_row.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled sale cannot have a payment plan.'; END IF;
  IF COALESCE(LENGTH(TRIM(p_terms_snapshot)), 0) < 40 OR jsonb_typeof(p_instalments) <> 'array' THEN
    RAISE EXCEPTION 'Complete payment-plan terms and instalments are required.';
  END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO already_paid
    FROM contract_sale_payment_allocations WHERE invoice_id = invoice_row.id;
  SELECT COUNT(*), COALESCE(SUM((item->>'amountCents')::INTEGER), 0)
    INTO schedule_count, schedule_total FROM jsonb_array_elements(p_instalments) item;
  IF schedule_count < 1 OR schedule_count > 24
     OR schedule_total <> invoice_row.total_inc_gst_cents - already_paid THEN
    RAISE EXCEPTION 'The instalment schedule must exactly equal the outstanding tax invoice balance.';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_instalments) WITH ORDINALITY AS x(item,n)
    WHERE (item->>'sequenceNumber')::integer <> n OR (item->>'amountCents')::integer <= 0 OR item->>'dueOn' IS NULL) THEN
    RAISE EXCEPTION 'Invalid instalment rows.';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT (item->>'dueOn')::date due_on, lag((item->>'dueOn')::date) OVER (ORDER BY n) previous
    FROM jsonb_array_elements(p_instalments) WITH ORDINALITY AS x(item,n)) d WHERE due_on<previous) THEN RAISE EXCEPTION 'Instalment dates must be in order.'; END IF;
  IF EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE sale_id=p_sale_id AND status='awaiting_acceptance' AND terms_snapshot=p_terms_snapshot) THEN
    RETURN (SELECT id FROM contract_sale_payment_plans WHERE sale_id=p_sale_id AND status='awaiting_acceptance');
  END IF;
  UPDATE contract_sale_payment_plans SET status='cancelled',updated_at=now() WHERE sale_id=p_sale_id AND status='awaiting_acceptance';
  INSERT INTO contract_sale_payment_plans(id, sale_id, balance_invoice_id, version, terms_snapshot, approved_by_staff_id, status, opening_paid_cents)
  VALUES (plan_id, p_sale_id, p_balance_invoice_id,
    COALESCE((SELECT MAX(version) + 1 FROM contract_sale_payment_plans WHERE sale_id = p_sale_id), 1),
    p_terms_snapshot, p_actor_id, 'awaiting_acceptance', already_paid);
  INSERT INTO contract_sale_payment_plan_instalments(payment_plan_id, sequence_number, due_on, amount_cents)
  SELECT plan_id, (item->>'sequenceNumber')::INTEGER, (item->>'dueOn')::DATE, (item->>'amountCents')::INTEGER
  FROM jsonb_array_elements(p_instalments) item;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', p_sale_id::TEXT, 'contract_sale.payment_plan.approved',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role, 'paymentPlanId', plan_id, 'instalmentCount', schedule_count));
  RETURN plan_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.create_contract_sale_payment_plan(p_sale_id uuid, p_balance_invoice_id uuid, p_terms_snapshot text, p_instalments jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_sale_payment_plan(p_sale_id uuid, p_balance_invoice_id uuid, p_terms_snapshot text, p_instalments jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;



-- Serialize outgoing document reservation with amendments. No email can reserve an older
-- revision after the monetary transaction has committed.
CREATE OR REPLACE FUNCTION public.guard_sale_document_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current_price integer; current_revision integer;
BEGIN
 SELECT agreed_purchase_price_inc_gst_cents INTO current_price FROM contract_product_sales WHERE id=NEW.sale_id FOR UPDATE;
 IF TG_TABLE_NAME='contract_sale_agreements' THEN
  IF NEW.purchase_price_inc_gst_cents_snapshot IS NOT NULL AND NEW.purchase_price_inc_gst_cents_snapshot<>current_price THEN RAISE EXCEPTION 'Sale price changed. Prepare the agreement again.'; END IF;
 ELSE
  SELECT revision_number INTO current_revision FROM contract_sale_invoices WHERE id=NEW.invoice_id AND sale_id=NEW.sale_id;
  IF NEW.invoice_revision IS DISTINCT FROM current_revision THEN RAISE EXCEPTION 'Invoice revision changed. Refresh and preview before sending.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_sale_agreement_revision BEFORE INSERT ON public.contract_sale_agreements FOR EACH ROW EXECUTE FUNCTION public.guard_sale_document_revision();
CREATE TRIGGER guard_sale_email_revision BEFORE INSERT ON public.contract_sale_invoice_email_deliveries FOR EACH ROW EXECUTE FUNCTION public.guard_sale_document_revision();
REVOKE ALL ON FUNCTION public.guard_sale_document_revision() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.protect_sale_email_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.invoice_revision IS DISTINCT FROM OLD.invoice_revision THEN RAISE EXCEPTION 'Invoice email revision is immutable.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_sale_email_revision BEFORE UPDATE ON public.contract_sale_invoice_email_deliveries FOR EACH ROW EXECUTE FUNCTION public.protect_sale_email_revision();
REVOKE ALL ON FUNCTION public.protect_sale_email_revision() FROM PUBLIC,anon,authenticated;

COMMIT;
