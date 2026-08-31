BEGIN;

ALTER TABLE contract_sale_invoices
  ADD COLUMN IF NOT EXISTS deposit_required_inc_gst_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipient_abn_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name_snapshot TEXT NOT NULL DEFAULT 'Secure Cleaning',
  ADD COLUMN IF NOT EXISTS supplier_abn_snapshot TEXT NOT NULL DEFAULT '81 674 121 825',
  ADD COLUMN IF NOT EXISTS supplier_email_snapshot TEXT NOT NULL DEFAULT 'info@securecleaning.com.au',
  ADD COLUMN IF NOT EXISTS sender_title_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS invoice_title_snapshot TEXT NOT NULL DEFAULT 'TAX INVOICE',
  ADD COLUMN IF NOT EXISTS email_subject_template_snapshot TEXT NOT NULL DEFAULT '{invoice_number} - Tax invoice for {product_code}',
  ADD COLUMN IF NOT EXISTS email_intro_template_snapshot TEXT NOT NULL DEFAULT 'Please find attached the full tax invoice for contract product {product_code}.',
  ADD COLUMN IF NOT EXISTS footer_note_snapshot TEXT NOT NULL DEFAULT 'This document is a tax invoice. All amounts are in Australian dollars and the total amount payable includes GST.';

CREATE TABLE IF NOT EXISTS contract_sale_invoice_templates (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  supplier_name TEXT NOT NULL CHECK (LENGTH(TRIM(supplier_name)) BETWEEN 2 AND 160),
  supplier_abn TEXT NOT NULL CHECK (LENGTH(REGEXP_REPLACE(supplier_abn, '[^0-9]', '', 'g')) = 11),
  supplier_email TEXT NOT NULL CHECK (LENGTH(TRIM(supplier_email)) BETWEEN 5 AND 320),
  invoice_title TEXT NOT NULL CHECK (LENGTH(TRIM(invoice_title)) BETWEEN 3 AND 40 AND invoice_title ~* 'tax invoice'),
  line_item_template TEXT NOT NULL CHECK (LENGTH(TRIM(line_item_template)) BETWEEN 10 AND 500),
  email_subject_template TEXT NOT NULL CHECK (LENGTH(TRIM(email_subject_template)) BETWEEN 5 AND 200),
  email_intro_template TEXT NOT NULL CHECK (LENGTH(TRIM(email_intro_template)) BETWEEN 10 AND 1500),
  payment_terms_template TEXT NOT NULL CHECK (LENGTH(TRIM(payment_terms_template)) BETWEEN 20 AND 1500),
  footer_note TEXT NOT NULL CHECK (LENGTH(TRIM(footer_note)) BETWEEN 20 AND 500),
  updated_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO contract_sale_invoice_templates(
  id, supplier_name, supplier_abn, supplier_email, invoice_title, line_item_template,
  email_subject_template, email_intro_template, payment_terms_template, footer_note
) VALUES (
  'default', 'Secure Cleaning', '81 674 121 825', 'info@securecleaning.com.au', 'TAX INVOICE',
  'Contract sale for {product_code} - {suburb}, {state}',
  '{invoice_number} - Tax invoice for {product_code}',
  'Please find attached the full tax invoice for contract product {product_code}.',
  '{deposit_inc_gst} deposit including GST is due on receipt and must clear before the site inspection. The remaining balance of {balance_inc_gst} is due before cleaning commences unless an approved payment plan applies.',
  'This document is a tax invoice. All amounts are in Australian dollars and the total amount payable includes GST.'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE contract_sale_invoice_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE contract_sale_invoice_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE contract_sale_invoice_templates TO service_role;

UPDATE contract_sale_invoices
SET deposit_required_inc_gst_cents = LEAST(total_inc_gst_cents, 50000)
WHERE invoice_type = 'deposit' AND deposit_required_inc_gst_cents = 0;

ALTER TABLE contract_sale_invoices
  DROP CONSTRAINT IF EXISTS contract_sale_invoices_invoice_type_check,
  DROP CONSTRAINT IF EXISTS contract_sale_invoices_deposit_required_check;
ALTER TABLE contract_sale_invoices
  ADD CONSTRAINT contract_sale_invoices_invoice_type_check
    CHECK (invoice_type IN ('sale', 'deposit', 'balance')),
  ADD CONSTRAINT contract_sale_invoices_deposit_required_check
    CHECK (deposit_required_inc_gst_cents >= 0 AND deposit_required_inc_gst_cents <= total_inc_gst_cents);

CREATE OR REPLACE FUNCTION confirm_contract_sale_payment(
  p_payment_id UUID,
  p_invoice_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_row contract_sale_payments%ROWTYPE;
  invoice_row contract_sale_invoices%ROWTYPE;
  paid_total INTEGER;
  sale_row contract_product_sales%ROWTYPE;
  all_due INTEGER;
  all_paid INTEGER;
  deposit_threshold INTEGER;
BEGIN
  IF p_actor_role NOT IN ('owner', 'manager') OR NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
  ) THEN RAISE EXCEPTION 'Owner or manager confirmation is required.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO payment_row FROM contract_sale_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found.'; END IF;
  SELECT * INTO sale_row FROM contract_product_sales WHERE id = payment_row.sale_id FOR UPDATE;
  SELECT * INTO invoice_row FROM contract_sale_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR invoice_row.sale_id <> payment_row.sale_id
     OR payment_row.intended_invoice_id <> invoice_row.id OR invoice_row.status = 'void' THEN
    RAISE EXCEPTION 'Invoice not found for this payment.';
  END IF;
  SELECT * INTO payment_row FROM contract_sale_payments WHERE id = p_payment_id FOR UPDATE;
  IF payment_row.status = 'confirmed' THEN RETURN; END IF;
  IF payment_row.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending payment can be confirmed.'; END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO paid_total
  FROM contract_sale_payment_allocations WHERE invoice_id = p_invoice_id;
  IF paid_total + payment_row.amount_cents > invoice_row.total_inc_gst_cents THEN
    RAISE EXCEPTION 'The payment exceeds the outstanding invoice balance.';
  END IF;

  INSERT INTO contract_sale_payment_allocations(sale_id, payment_id, invoice_id, amount_cents)
  VALUES (payment_row.sale_id, payment_row.id, invoice_row.id, payment_row.amount_cents)
  ON CONFLICT (payment_id, invoice_id) DO NOTHING;
  UPDATE contract_sale_payments SET status = 'confirmed', confirmed_by_staff_id = p_actor_id,
    confirmed_at = NOW(), updated_at = NOW() WHERE id = payment_row.id;
  SELECT COALESCE(SUM(amount_cents), 0) INTO paid_total
  FROM contract_sale_payment_allocations WHERE invoice_id = p_invoice_id;
  UPDATE contract_sale_invoices SET status = CASE WHEN paid_total >= total_inc_gst_cents THEN 'paid' ELSE 'part_paid' END,
    updated_at = NOW() WHERE id = invoice_row.id;

  deposit_threshold := CASE
    WHEN invoice_row.invoice_type = 'sale' THEN invoice_row.deposit_required_inc_gst_cents
    WHEN invoice_row.invoice_type = 'deposit' THEN invoice_row.total_inc_gst_cents
    ELSE 0
  END;
  IF deposit_threshold > 0 AND paid_total >= deposit_threshold
     AND sale_row.status IN ('draft', 'deposit_due') THEN
    UPDATE contract_product_sales SET status = 'inspection_ready', updated_by_staff_id = p_actor_id,
      updated_at = NOW() WHERE id = sale_row.id;
  END IF;

  IF sale_row.handover_at IS NOT NULL THEN
    SELECT COALESCE(SUM(total_inc_gst_cents), 0) INTO all_due
      FROM contract_sale_invoices WHERE sale_id = sale_row.id AND status <> 'void';
    SELECT COALESCE(SUM(a.amount_cents), 0) INTO all_paid
      FROM contract_sale_payment_allocations a
      JOIN contract_sale_invoices i ON i.id = a.invoice_id
      WHERE i.sale_id = sale_row.id AND i.status <> 'void';
    IF all_due > 0 AND all_paid >= all_due THEN
      UPDATE contract_product_sales SET status = 'completed', updated_by_staff_id = p_actor_id,
        updated_at = NOW() WHERE id = sale_row.id;
      UPDATE contract_products SET status = 'sold', sold_at = NOW(), updated_at = NOW()
        WHERE id = sale_row.product_id;
      UPDATE contract_sale_payment_plans SET status = 'completed', updated_at = NOW()
        WHERE sale_id = sale_row.id AND status = 'active';
    END IF;
  END IF;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', payment_row.sale_id::TEXT, 'contract_sale.payment.confirmed',
    jsonb_build_object('paymentId', p_payment_id, 'invoiceId', p_invoice_id, 'actorId', p_actor_id));
END;
$$;

CREATE OR REPLACE FUNCTION create_contract_sale_payment_plan(
  p_sale_id UUID,
  p_balance_invoice_id UUID,
  p_terms_snapshot TEXT,
  p_instalments JSONB,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    sale_row.assigned_staff_id IS DISTINCT FROM p_actor_id OR NOT EXISTS (
      SELECT 1 FROM contract_products
      WHERE id = sale_row.product_id AND state IS NOT DISTINCT FROM p_actor_state
    )
  ) THEN RAISE EXCEPTION 'Sale not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invoice_row FROM contract_sale_invoices WHERE id = p_balance_invoice_id AND sale_id = p_sale_id FOR SHARE;
  IF NOT FOUND OR invoice_row.invoice_type NOT IN ('sale', 'balance') OR invoice_row.status IN ('paid', 'void') THEN
    RAISE EXCEPTION 'An unpaid sale tax invoice is required.';
  END IF;
  IF EXISTS (SELECT 1 FROM contract_sale_payment_plans WHERE sale_id = p_sale_id AND status = 'active') THEN
    RAISE EXCEPTION 'An active payment plan already exists.';
  END IF;
  IF COALESCE(LENGTH(TRIM(p_terms_snapshot)), 0) < 40 OR jsonb_typeof(p_instalments) <> 'array' THEN
    RAISE EXCEPTION 'Complete payment-plan terms and instalments are required.';
  END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO already_paid
    FROM contract_sale_payment_allocations WHERE invoice_id = invoice_row.id;
  SELECT COUNT(*), COALESCE(SUM((item->>'amountCents')::INTEGER), 0)
    INTO schedule_count, schedule_total FROM jsonb_array_elements(p_instalments) item;
  IF schedule_count < 2 OR schedule_count > 24
     OR schedule_total <> invoice_row.total_inc_gst_cents - already_paid THEN
    RAISE EXCEPTION 'The instalment schedule must exactly equal the outstanding tax invoice balance.';
  END IF;

  INSERT INTO contract_sale_payment_plans(id, sale_id, balance_invoice_id, version, terms_snapshot, approved_by_staff_id)
  VALUES (plan_id, p_sale_id, p_balance_invoice_id,
    COALESCE((SELECT MAX(version) + 1 FROM contract_sale_payment_plans WHERE sale_id = p_sale_id), 1),
    p_terms_snapshot, p_actor_id);
  INSERT INTO contract_sale_payment_plan_instalments(payment_plan_id, sequence_number, due_on, amount_cents)
  SELECT plan_id, (item->>'sequenceNumber')::INTEGER, (item->>'dueOn')::DATE, (item->>'amountCents')::INTEGER
  FROM jsonb_array_elements(p_instalments) item;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', p_sale_id::TEXT, 'contract_sale.payment_plan.approved',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role, 'paymentPlanId', plan_id, 'instalmentCount', schedule_count));
  RETURN plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_contract_sale_handover(
  p_sale_id UUID,
  p_commenced_on DATE,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sale_row contract_product_sales%ROWTYPE;
  cleaner_row cleaners%ROWTYPE;
  product_row contract_products%ROWTYPE;
  deposit_paid BOOLEAN;
  balance_paid BOOLEAN;
  active_plan BOOLEAN;
  completion_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE
      AND role::TEXT = p_actor_role AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN RAISE EXCEPTION 'Actor is not authorized.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO sale_row FROM contract_product_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF p_actor_role = 'agent' AND (
    sale_row.assigned_staff_id IS DISTINCT FROM p_actor_id OR NOT EXISTS (
      SELECT 1 FROM contract_products
      WHERE id = sale_row.product_id AND state IS NOT DISTINCT FROM p_actor_state
    )
  ) THEN RAISE EXCEPTION 'Sale not found.' USING ERRCODE = '42501';
  END IF;
  IF sale_row.handover_at IS NOT NULL THEN RETURN sale_row.status; END IF;
  SELECT * INTO product_row FROM contract_products WHERE id = sale_row.product_id FOR SHARE;
  SELECT * INTO cleaner_row FROM cleaners WHERE id = sale_row.cleaner_id FOR SHARE;
  IF cleaner_row.status <> 'approved' OR cleaner_row.state IS DISTINCT FROM product_row.state THEN
    RAISE EXCEPTION 'The cleaner must remain approved and in the product state.';
  END IF;
  IF sale_row.site_id IS NULL THEN RAISE EXCEPTION 'The client site must be linked before handover.'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM contract_sale_invoices i
    WHERE i.sale_id = p_sale_id AND i.status <> 'void' AND (
      (i.invoice_type = 'sale' AND (SELECT COALESCE(SUM(a.amount_cents), 0) FROM contract_sale_payment_allocations a WHERE a.invoice_id = i.id) >= i.deposit_required_inc_gst_cents)
      OR (i.invoice_type = 'deposit' AND i.status = 'paid')
    )
  ) INTO deposit_paid;
  IF NOT deposit_paid THEN RAISE EXCEPTION 'The deposit must be confirmed before handover.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM contract_sale_inspections WHERE sale_id = p_sale_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Complete the site inspection before handover.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM contract_sale_payment_plans WHERE sale_id = p_sale_id AND status = 'active') INTO active_plan;
  IF NOT EXISTS (
    SELECT 1 FROM contract_sale_agreements
    WHERE sale_id = p_sale_id AND status = 'signed'
      AND (NOT active_plan OR agreement_type = 'payment_plan')
  ) THEN RAISE EXCEPTION 'Upload the signed agreement before handover.'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM contract_sale_invoices
    WHERE sale_id = p_sale_id AND status = 'paid' AND invoice_type IN ('sale', 'balance')
  ) INTO balance_paid;
  IF NOT balance_paid AND NOT active_plan THEN
    RAISE EXCEPTION 'The tax invoice must be paid in full or an approved payment plan must be active.';
  END IF;

  INSERT INTO contract_sale_site_assignments(sale_id, site_id, cleaner_id, commenced_on, assigned_by_staff_id)
  VALUES (sale_row.id, sale_row.site_id, sale_row.cleaner_id, p_commenced_on, p_actor_id)
  ON CONFLICT (sale_id) DO NOTHING;
  completion_status := CASE WHEN balance_paid THEN 'completed' ELSE 'active_payment_plan' END;
  UPDATE contract_product_sales SET status = completion_status, commencement_date = p_commenced_on,
    handover_at = NOW(), updated_by_staff_id = p_actor_id, updated_at = NOW() WHERE id = sale_row.id;
  IF balance_paid THEN
    UPDATE contract_products SET status = 'sold', sold_at = NOW(), updated_at = NOW() WHERE id = sale_row.product_id;
    UPDATE contract_sale_payment_plans SET status = 'completed', updated_at = NOW()
      WHERE sale_id = sale_row.id AND status = 'active';
  END IF;
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', sale_row.id::TEXT, 'contract_sale.handover.completed',
    jsonb_build_object('actorId', p_actor_id, 'commencedOn', p_commenced_on, 'status', completion_status));
  RETURN completion_status;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_contract_sale_invoice_issue()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  sale_row contract_product_sales%ROWTYPE;
  deposit_row contract_sale_invoices%ROWTYPE;
BEGIN
  SELECT * INTO sale_row FROM contract_product_sales WHERE id = NEW.sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product sale not found.'; END IF;
  IF sale_row.handover_at IS NOT NULL OR sale_row.status IN ('completed', 'cancelled', 'active_payment_plan') THEN
    RAISE EXCEPTION 'An invoice cannot be issued for this sale state.';
  END IF;
  IF NEW.gst_component_cents < 0 OR NEW.gst_component_cents > NEW.total_inc_gst_cents THEN
    RAISE EXCEPTION 'The invoice GST component is invalid.';
  END IF;

  IF NEW.invoice_type = 'sale' THEN
    IF sale_row.status <> 'draft'
       OR NEW.total_inc_gst_cents <> sale_row.agreed_purchase_price_inc_gst_cents
       OR NEW.deposit_required_inc_gst_cents <> sale_row.deposit_inc_gst_cents THEN
      RAISE EXCEPTION 'The full sale invoice must match the agreed purchase price and deposit.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM contract_sale_agreements WHERE sale_id = sale_row.id AND status = 'signed'
    ) THEN RAISE EXCEPTION 'The signed sale agreement is required before invoicing.'; END IF;
    UPDATE contract_product_sales SET status = 'deposit_due', updated_by_staff_id = NEW.issued_by_staff_id,
      updated_at = NOW() WHERE id = sale_row.id;
  ELSIF NEW.invoice_type = 'deposit' THEN
    IF sale_row.status <> 'draft' OR NEW.total_inc_gst_cents <> sale_row.deposit_inc_gst_cents THEN
      RAISE EXCEPTION 'The fixed deposit can only be issued once from a draft sale.';
    END IF;
    UPDATE contract_product_sales SET status = 'deposit_due', updated_by_staff_id = NEW.issued_by_staff_id,
      updated_at = NOW() WHERE id = sale_row.id;
  ELSE
    IF sale_row.status <> 'agreement_pending' THEN
      RAISE EXCEPTION 'Complete the legacy deposit and inspection before issuing the balance.';
    END IF;
    SELECT * INTO deposit_row FROM contract_sale_invoices
      WHERE sale_id = sale_row.id AND invoice_type = 'deposit' AND status = 'paid' FOR SHARE;
    IF NOT FOUND OR NEW.total_inc_gst_cents <> sale_row.agreed_purchase_price_inc_gst_cents - deposit_row.total_inc_gst_cents THEN
      RAISE EXCEPTION 'The balance invoice must equal the outstanding agreed purchase price.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM contract_sale_inspections WHERE sale_id = sale_row.id AND status = 'completed'
    ) THEN RAISE EXCEPTION 'Complete the inspection before issuing the balance.'; END IF;
    UPDATE contract_product_sales SET status = 'balance_due', updated_by_staff_id = NEW.issued_by_staff_id,
      updated_at = NOW() WHERE id = sale_row.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_contract_sale_invoice_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
    OR OLD.sale_id IS DISTINCT FROM NEW.sale_id
    OR OLD.invoice_type IS DISTINCT FROM NEW.invoice_type
    OR OLD.description_snapshot IS DISTINCT FROM NEW.description_snapshot
    OR OLD.total_inc_gst_cents IS DISTINCT FROM NEW.total_inc_gst_cents
    OR OLD.gst_component_cents IS DISTINCT FROM NEW.gst_component_cents
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
    OR OLD.sender_name_snapshot IS DISTINCT FROM NEW.sender_name_snapshot
    OR OLD.sender_title_snapshot IS DISTINCT FROM NEW.sender_title_snapshot
    OR OLD.sender_email_snapshot IS DISTINCT FROM NEW.sender_email_snapshot
    OR OLD.invoice_title_snapshot IS DISTINCT FROM NEW.invoice_title_snapshot
    OR OLD.email_subject_template_snapshot IS DISTINCT FROM NEW.email_subject_template_snapshot
    OR OLD.email_intro_template_snapshot IS DISTINCT FROM NEW.email_intro_template_snapshot
    OR OLD.footer_note_snapshot IS DISTINCT FROM NEW.footer_note_snapshot
    OR OLD.issued_by_staff_id IS DISTINCT FROM NEW.issued_by_staff_id
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
  THEN RAISE EXCEPTION 'Issued invoice snapshots are immutable.'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION confirm_contract_sale_payment(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_contract_sale_payment(UUID, UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION create_contract_sale_payment_plan(UUID, UUID, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_contract_sale_payment_plan(UUID, UUID, TEXT, JSONB, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION enforce_contract_sale_invoice_issue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_contract_sale_invoice_snapshot() FROM PUBLIC, anon, authenticated;

COMMIT;
