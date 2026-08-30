-- Secure Cleaning - contract product sale, invoicing, inspection, and handover workflow
-- Apply after staff_accounts_migration.sql, client_crm_foundation_migration.sql,
-- contract_products_migration.sql, cleaners_migration.sql, and audit_log_migration.sql.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS contract_sale_code_seq START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS contract_sale_invoice_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS contract_product_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_code TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES contract_products(id) ON DELETE RESTRICT,
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE RESTRICT,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  source_quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES sites(id) ON DELETE RESTRICT,
  assigned_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'deposit_due', 'inspection_ready', 'inspection_scheduled',
      'agreement_pending', 'balance_due', 'active_payment_plan',
      'ready_for_handover', 'completed', 'cancelled'
    )),
  agreed_purchase_price_inc_gst_cents INTEGER NOT NULL
    CHECK (agreed_purchase_price_inc_gst_cents > 0),
  deposit_inc_gst_cents INTEGER NOT NULL DEFAULT 50000
    CHECK (deposit_inc_gst_cents = 50000),
  product_snapshot JSONB NOT NULL,
  cleaner_snapshot JSONB NOT NULL,
  client_snapshot JSONB NOT NULL,
  site_snapshot JSONB,
  commencement_date DATE,
  internal_notes TEXT,
  handover_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  updated_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agreed_purchase_price_inc_gst_cents > deposit_inc_gst_cents),
  UNIQUE(id, site_id, cleaner_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_product_sales_one_active
  ON contract_product_sales(product_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_contract_product_sales_assignee
  ON contract_product_sales(assigned_staff_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_product_sales_cleaner
  ON contract_product_sales(cleaner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS contract_sale_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT (
    'SCINV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('contract_sale_invoice_number_seq')::TEXT, 5, '0')
  ),
  idempotency_key UUID NOT NULL UNIQUE,
  sale_id UUID NOT NULL REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('deposit', 'balance')),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'part_paid', 'paid', 'overdue', 'void')),
  description_snapshot TEXT NOT NULL,
  total_inc_gst_cents INTEGER NOT NULL CHECK (total_inc_gst_cents > 0),
  gst_component_cents INTEGER NOT NULL CHECK (gst_component_cents >= 0),
  due_on DATE,
  payment_terms_snapshot TEXT NOT NULL,
  recipient_name_snapshot TEXT NOT NULL,
  recipient_business_snapshot TEXT NOT NULL,
  recipient_email_snapshot TEXT NOT NULL,
  recipient_address_snapshot TEXT,
  sender_name_snapshot TEXT NOT NULL,
  sender_email_snapshot TEXT NOT NULL,
  issued_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'unknown')),
  delivery_error TEXT,
  voided_at TIMESTAMPTZ,
  voided_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id, sale_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_sale_invoices_active_type
  ON contract_sale_invoices(sale_id, invoice_type) WHERE status <> 'void';
CREATE INDEX IF NOT EXISTS idx_contract_sale_invoices_sale
  ON contract_sale_invoices(sale_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS contract_sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  sale_id UUID NOT NULL REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  intended_invoice_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  received_on DATE NOT NULL,
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('bank_transfer', 'card', 'cash', 'other')),
  payment_reference TEXT NOT NULL,
  evidence_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  recorded_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  confirmed_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  rejected_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id, sale_id),
  FOREIGN KEY(intended_invoice_id, sale_id)
    REFERENCES contract_sale_invoices(id, sale_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS contract_sale_payment_allocations (
  sale_id UUID NOT NULL REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(payment_id, invoice_id),
  FOREIGN KEY(payment_id, sale_id)
    REFERENCES contract_sale_payments(id, sale_id) ON DELETE RESTRICT,
  FOREIGN KEY(invoice_id, sale_id)
    REFERENCES contract_sale_invoices(id, sale_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_contract_sale_payments_sale
  ON contract_sale_payments(sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_sale_allocations_invoice
  ON contract_sale_payment_allocations(invoice_id);

CREATE TABLE IF NOT EXISTS contract_sale_payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  balance_invoice_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'defaulted')),
  terms_snapshot TEXT NOT NULL,
  approved_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sale_id, version),
  FOREIGN KEY(balance_invoice_id, sale_id)
    REFERENCES contract_sale_invoices(id, sale_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_sale_payment_plans_one_active
  ON contract_sale_payment_plans(sale_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS contract_sale_payment_plan_instalments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id UUID NOT NULL REFERENCES contract_sale_payment_plans(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  due_on DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_plan_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS contract_sale_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 480),
  time_zone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  location_snapshot TEXT NOT NULL,
  client_name_snapshot TEXT NOT NULL,
  client_email_snapshot TEXT NOT NULL,
  cleaner_name_snapshot TEXT NOT NULL,
  cleaner_email_snapshot TEXT NOT NULL,
  staff_name_snapshot TEXT NOT NULL,
  staff_email_snapshot TEXT NOT NULL,
  notes TEXT,
  invite_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invite_status IN ('pending', 'sent', 'failed', 'unknown')),
  provider_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  invite_error TEXT,
  scheduled_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  completed_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_sale_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('standard', 'payment_plan')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'void')),
  content_snapshot TEXT NOT NULL,
  cleaner_name_snapshot TEXT NOT NULL,
  cleaner_business_snapshot TEXT NOT NULL,
  cleaner_email_snapshot TEXT NOT NULL,
  created_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  signed_at TIMESTAMPTZ,
  signed_file_name TEXT,
  signed_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sale_id, version)
);

CREATE INDEX IF NOT EXISTS idx_contract_sale_agreements_sale
  ON contract_sale_agreements(sale_id, version DESC);

CREATE TABLE IF NOT EXISTS contract_sale_site_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE,
  site_id UUID NOT NULL,
  cleaner_id UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  commenced_on DATE,
  assigned_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  FOREIGN KEY(sale_id, site_id, cleaner_id)
    REFERENCES contract_product_sales(id, site_id, cleaner_id) ON DELETE RESTRICT,
  FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE RESTRICT,
  FOREIGN KEY(cleaner_id) REFERENCES cleaners(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_sale_site_assignments_active_site
  ON contract_sale_site_assignments(site_id) WHERE active = TRUE;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-sale-agreements', 'contract-sale-agreements', FALSE, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'];

CREATE OR REPLACE FUNCTION create_contract_product_sale(
  p_product_id UUID,
  p_cleaner_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_row contract_products%ROWTYPE;
  cleaner_row cleaners%ROWTYPE;
  opportunity_row crm_opportunities%ROWTYPE;
  client_snapshot JSONB;
  site_snapshot JSONB;
  existing_sale_id UUID;
  existing_cleaner_id UUID;
  new_sale_id UUID := gen_random_uuid();
  new_sale_code TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN RAISE EXCEPTION 'Actor is not authorized.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO product_row FROM contract_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;
  IF p_actor_role = 'agent' AND (
    product_row.assigned_staff_id IS DISTINCT FROM p_actor_id OR product_row.state IS DISTINCT FROM p_actor_state
  ) THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = '42501'; END IF;
  SELECT id, cleaner_id INTO existing_sale_id, existing_cleaner_id FROM contract_product_sales
  WHERE product_id = p_product_id AND status <> 'cancelled' LIMIT 1;
  IF existing_sale_id IS NOT NULL THEN
    IF existing_cleaner_id IS DISTINCT FROM p_cleaner_id THEN
      RAISE EXCEPTION 'This product already has an active sale with another cleaner.';
    END IF;
    RETURN existing_sale_id;
  END IF;
  IF product_row.status <> 'available' THEN
    RAISE EXCEPTION 'Only an available product can start a sale.';
  END IF;
  IF ROUND(product_row.purchase_price_ex_gst_cents * 1.1) <= 50000 THEN
    RAISE EXCEPTION 'The agreed purchase price must be greater than the $500 deposit.';
  END IF;

  SELECT * INTO cleaner_row FROM cleaners WHERE id = p_cleaner_id FOR SHARE;
  IF NOT FOUND OR cleaner_row.status <> 'approved' OR cleaner_row.compliance_status IS DISTINCT FROM 'current' THEN
    RAISE EXCEPTION 'The cleaner must be approved and compliance-current before a sale can begin.';
  END IF;
  IF UPPER(COALESCE(cleaner_row.state, '')) <> product_row.state THEN
    RAISE EXCEPTION 'The cleaner must belong to the product state.';
  END IF;

  SELECT * INTO opportunity_row FROM crm_opportunities WHERE id = product_row.opportunity_id;
  SELECT to_jsonb(client_row) INTO client_snapshot FROM clients client_row WHERE client_row.id = opportunity_row.primary_contact_id;
  IF client_snapshot IS NULL THEN RAISE EXCEPTION 'The client contact is required before a sale can begin.'; END IF;
  IF opportunity_row.site_id IS NOT NULL THEN
    SELECT to_jsonb(site_row) INTO site_snapshot FROM sites site_row WHERE site_row.id = opportunity_row.site_id;
  END IF;
  new_sale_code := 'PS-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('contract_sale_code_seq')::TEXT, 5, '0');

  INSERT INTO contract_product_sales(
    id, sale_code, product_id, cleaner_id, opportunity_id, source_quote_id, site_id,
    assigned_staff_id, status, agreed_purchase_price_inc_gst_cents, product_snapshot,
    cleaner_snapshot, client_snapshot, site_snapshot,
    created_by_staff_id, updated_by_staff_id
  ) VALUES (
    new_sale_id, new_sale_code, product_row.id, cleaner_row.id, product_row.opportunity_id,
    product_row.source_quote_id, opportunity_row.site_id, product_row.assigned_staff_id, 'draft',
    ROUND(product_row.purchase_price_ex_gst_cents * 1.1), to_jsonb(product_row),
    to_jsonb(cleaner_row), client_snapshot, site_snapshot, p_actor_id, p_actor_id
  );

  UPDATE contract_products SET status = 'reserved', reserved_at = NOW(), updated_at = NOW()
  WHERE id = product_row.id;
  UPDATE contract_product_interests SET status = 'selected', updated_at = NOW()
    WHERE product_id = p_product_id AND cleaner_id = p_cleaner_id;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', new_sale_id::TEXT, 'contract_sale.created', jsonb_build_object(
    'actorId', p_actor_id, 'actorRole', p_actor_role, 'productId', p_product_id,
    'cleanerId', p_cleaner_id, 'depositIncGstCents', 50000
  ));
  RETURN new_sale_id;
END;
$$;

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

  IF invoice_row.invoice_type = 'deposit' AND paid_total >= invoice_row.total_inc_gst_cents
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
  IF NOT FOUND OR invoice_row.invoice_type <> 'balance' OR invoice_row.status IN ('paid', 'void') THEN
    RAISE EXCEPTION 'An unpaid balance invoice is required.';
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
    RAISE EXCEPTION 'The instalment schedule must exactly equal the outstanding balance invoice.';
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

CREATE OR REPLACE FUNCTION cancel_contract_product_sale(
  p_sale_id UUID,
  p_reason TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE sale_row contract_product_sales%ROWTYPE;
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
  IF sale_row.handover_at IS NOT NULL THEN RAISE EXCEPTION 'A handed-over sale cannot be cancelled.'; END IF;
  IF COALESCE(LENGTH(TRIM(p_reason)), 0) < 5 THEN RAISE EXCEPTION 'A cancellation reason is required.'; END IF;
  IF EXISTS (SELECT 1 FROM contract_sale_payments WHERE sale_id = p_sale_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'Confirmed payments must be resolved before cancellation.';
  END IF;
  UPDATE contract_sale_payments SET status = 'rejected', rejected_by_staff_id = p_actor_id,
    rejected_at = NOW(), rejection_reason = 'Sale cancelled: ' || p_reason, updated_at = NOW()
    WHERE sale_id = p_sale_id AND status = 'pending';
  UPDATE contract_sale_invoices SET status = 'void', voided_at = NOW(), voided_by_staff_id = p_actor_id,
    void_reason = 'Sale cancelled: ' || p_reason, updated_at = NOW()
    WHERE sale_id = p_sale_id AND status <> 'void';
  UPDATE contract_sale_payment_plans SET status = 'cancelled', updated_at = NOW()
    WHERE sale_id = p_sale_id AND status = 'active';
  UPDATE contract_product_sales SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = p_reason,
    updated_by_staff_id = p_actor_id, updated_at = NOW() WHERE id = p_sale_id;
  UPDATE contract_products SET status = 'available', reserved_at = NULL, updated_at = NOW()
    WHERE id = sale_row.product_id AND status = 'reserved';
  UPDATE contract_product_interests SET status = 'shortlisted', updated_at = NOW()
    WHERE product_id = sale_row.product_id AND cleaner_id = sale_row.cleaner_id AND status = 'selected';
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', p_sale_id::TEXT, 'contract_sale.cancelled',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role, 'reason', p_reason));
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
  IF cleaner_row.status <> 'approved' OR cleaner_row.compliance_status IS DISTINCT FROM 'current'
     OR cleaner_row.state IS DISTINCT FROM product_row.state THEN
    RAISE EXCEPTION 'The cleaner must remain approved, compliance-current, and in the product state.';
  END IF;
  IF sale_row.site_id IS NULL THEN RAISE EXCEPTION 'The client site must be linked before handover.'; END IF;
  SELECT EXISTS (SELECT 1 FROM contract_sale_invoices WHERE sale_id = p_sale_id AND invoice_type = 'deposit' AND status = 'paid') INTO deposit_paid;
  IF NOT deposit_paid THEN RAISE EXCEPTION 'The deposit must be confirmed before handover.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM contract_sale_inspections WHERE sale_id = p_sale_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Complete the site inspection before handover.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM contract_sale_payment_plans WHERE sale_id = p_sale_id AND status = 'active') INTO active_plan;
  IF NOT EXISTS (
    SELECT 1 FROM contract_sale_agreements
    WHERE sale_id = p_sale_id AND status = 'signed'
      AND (NOT active_plan OR agreement_type = 'payment_plan')
  ) THEN
    RAISE EXCEPTION 'Upload the signed agreement before handover.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM contract_sale_invoices WHERE sale_id = p_sale_id AND invoice_type = 'balance' AND status = 'paid') INTO balance_paid;
  IF NOT balance_paid AND NOT active_plan THEN
    RAISE EXCEPTION 'The balance must be paid or an approved payment plan must be active.';
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

  IF NEW.invoice_type = 'deposit' THEN
    IF sale_row.status <> 'draft' OR NEW.total_inc_gst_cents <> sale_row.deposit_inc_gst_cents THEN
      RAISE EXCEPTION 'The fixed deposit can only be issued once from a draft sale.';
    END IF;
    UPDATE contract_product_sales SET status = 'deposit_due', updated_by_staff_id = NEW.issued_by_staff_id,
      updated_at = NOW() WHERE id = sale_row.id;
  ELSE
    IF sale_row.status <> 'agreement_pending' THEN
      RAISE EXCEPTION 'Complete the deposit and inspection before issuing the balance.';
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

CREATE OR REPLACE FUNCTION protect_contract_product_sale_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.sale_code IS DISTINCT FROM NEW.sale_code
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id
    OR OLD.opportunity_id IS DISTINCT FROM NEW.opportunity_id
    OR OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id
    OR OLD.site_id IS DISTINCT FROM NEW.site_id
    OR OLD.agreed_purchase_price_inc_gst_cents IS DISTINCT FROM NEW.agreed_purchase_price_inc_gst_cents
    OR OLD.deposit_inc_gst_cents IS DISTINCT FROM NEW.deposit_inc_gst_cents
    OR OLD.product_snapshot IS DISTINCT FROM NEW.product_snapshot
    OR OLD.cleaner_snapshot IS DISTINCT FROM NEW.cleaner_snapshot
    OR OLD.client_snapshot IS DISTINCT FROM NEW.client_snapshot
    OR OLD.site_snapshot IS DISTINCT FROM NEW.site_snapshot
  THEN RAISE EXCEPTION 'Product sale source and financial snapshots are immutable.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_product_sale_snapshot ON contract_product_sales;
CREATE TRIGGER trg_contract_product_sale_snapshot BEFORE UPDATE ON contract_product_sales
  FOR EACH ROW EXECUTE FUNCTION protect_contract_product_sale_snapshot();

DROP TRIGGER IF EXISTS trg_contract_sale_invoice_issue ON contract_sale_invoices;
CREATE TRIGGER trg_contract_sale_invoice_issue BEFORE INSERT ON contract_sale_invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_contract_sale_invoice_issue();

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
    OR OLD.due_on IS DISTINCT FROM NEW.due_on
    OR OLD.payment_terms_snapshot IS DISTINCT FROM NEW.payment_terms_snapshot
    OR OLD.recipient_name_snapshot IS DISTINCT FROM NEW.recipient_name_snapshot
    OR OLD.recipient_business_snapshot IS DISTINCT FROM NEW.recipient_business_snapshot
    OR OLD.recipient_email_snapshot IS DISTINCT FROM NEW.recipient_email_snapshot
    OR OLD.recipient_address_snapshot IS DISTINCT FROM NEW.recipient_address_snapshot
    OR OLD.sender_name_snapshot IS DISTINCT FROM NEW.sender_name_snapshot
    OR OLD.sender_email_snapshot IS DISTINCT FROM NEW.sender_email_snapshot
    OR OLD.issued_by_staff_id IS DISTINCT FROM NEW.issued_by_staff_id
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
  THEN RAISE EXCEPTION 'Issued invoice snapshots are immutable.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_invoice_snapshot ON contract_sale_invoices;
CREATE TRIGGER trg_contract_sale_invoice_snapshot BEFORE UPDATE ON contract_sale_invoices
  FOR EACH ROW EXECUTE FUNCTION protect_contract_sale_invoice_snapshot();

CREATE OR REPLACE FUNCTION protect_contract_sale_payment_record()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.sale_id IS DISTINCT FROM NEW.sale_id
    OR OLD.intended_invoice_id IS DISTINCT FROM NEW.intended_invoice_id
    OR OLD.amount_cents IS DISTINCT FROM NEW.amount_cents
    OR OLD.received_on IS DISTINCT FROM NEW.received_on
    OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
    OR OLD.payment_reference IS DISTINCT FROM NEW.payment_reference
    OR OLD.evidence_note IS DISTINCT FROM NEW.evidence_note
    OR OLD.recorded_by_staff_id IS DISTINCT FROM NEW.recorded_by_staff_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.status <> 'pending'
  THEN RAISE EXCEPTION 'Payment evidence is immutable after recording.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_payment_record ON contract_sale_payments;
CREATE TRIGGER trg_contract_sale_payment_record BEFORE UPDATE ON contract_sale_payments
  FOR EACH ROW EXECUTE FUNCTION protect_contract_sale_payment_record();

CREATE OR REPLACE FUNCTION protect_signed_contract_sale_agreement()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.content_snapshot IS DISTINCT FROM NEW.content_snapshot
    OR OLD.cleaner_name_snapshot IS DISTINCT FROM NEW.cleaner_name_snapshot
    OR OLD.cleaner_business_snapshot IS DISTINCT FROM NEW.cleaner_business_snapshot
    OR OLD.cleaner_email_snapshot IS DISTINCT FROM NEW.cleaner_email_snapshot
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.agreement_type IS DISTINCT FROM NEW.agreement_type
    OR (OLD.status = 'signed' AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
      OR NEW.signed_file_name IS DISTINCT FROM OLD.signed_file_name
      OR NEW.signed_storage_path IS DISTINCT FROM OLD.signed_storage_path
    ))
  THEN RAISE EXCEPTION 'Agreement snapshots and signed evidence are immutable.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_agreement_snapshot ON contract_sale_agreements;
CREATE TRIGGER trg_contract_sale_agreement_snapshot BEFORE UPDATE ON contract_sale_agreements
  FOR EACH ROW EXECUTE FUNCTION protect_signed_contract_sale_agreement();

DO $$
DECLARE
  v_table_name TEXT;
  v_trigger_name TEXT;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'contract_product_sales', 'contract_sale_invoices', 'contract_sale_payments',
    'contract_sale_payment_plans', 'contract_sale_inspections', 'contract_sale_agreements'
  ] LOOP
    v_trigger_name := 'trg_' || v_table_name || '_updated_at';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_trigger_name, v_table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      v_trigger_name, v_table_name);
  END LOOP;
END $$;

ALTER TABLE contract_product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_payment_plan_instalments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sale_site_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE contract_product_sales, contract_sale_invoices, contract_sale_payments,
  contract_sale_payment_allocations, contract_sale_payment_plans, contract_sale_payment_plan_instalments,
  contract_sale_inspections, contract_sale_agreements, contract_sale_site_assignments
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE contract_product_sales, contract_sale_invoices, contract_sale_payments,
  contract_sale_payment_allocations, contract_sale_payment_plans, contract_sale_payment_plan_instalments,
  contract_sale_inspections, contract_sale_agreements, contract_sale_site_assignments TO service_role;
REVOKE ALL ON SEQUENCE contract_sale_code_seq, contract_sale_invoice_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE contract_sale_code_seq, contract_sale_invoice_number_seq TO service_role;

DO $$
DECLARE v_table_name TEXT;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'contract_product_sales', 'contract_sale_invoices', 'contract_sale_payments',
    'contract_sale_payment_allocations', 'contract_sale_payment_plans',
    'contract_sale_payment_plan_instalments', 'contract_sale_inspections',
    'contract_sale_agreements', 'contract_sale_site_assignments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table_name
        AND policyname = 'Service role full access — ' || v_table_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'Service role full access — ' || v_table_name, v_table_name);
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role full access — contract sale agreements'
  ) THEN
    CREATE POLICY "Service role full access — contract sale agreements"
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'contract-sale-agreements')
      WITH CHECK (bucket_id = 'contract-sale-agreements');
  END IF;
END $$;

REVOKE ALL ON FUNCTION create_contract_product_sale(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION confirm_contract_sale_payment(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_contract_sale_payment_plan(UUID, UUID, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_contract_product_sale(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_contract_sale_invoice_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_contract_product_sale_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_contract_sale_invoice_issue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_contract_sale_payment_record() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_signed_contract_sale_agreement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_contract_product_sale(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_contract_sale_payment(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_contract_sale_payment_plan(UUID, UUID, TEXT, JSONB, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_contract_product_sale(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

COMMIT;
