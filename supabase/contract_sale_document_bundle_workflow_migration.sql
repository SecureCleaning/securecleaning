-- Final-price and bundled invoice/agreement workflow for product sales.
-- Apply after contract_sale_tax_invoice_workflow_migration.sql.

BEGIN;

ALTER TABLE contract_product_sales
  ADD COLUMN IF NOT EXISTS price_finalised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_finalised_by_staff_id UUID
    REFERENCES admin_staff_accounts(id) ON DELETE SET NULL;

-- Existing document snapshots already prove that the recorded price was relied on.
UPDATE contract_product_sales sale
SET price_finalised_at = COALESCE(sale.price_finalised_at, sale.updated_at, sale.created_at),
    price_finalised_by_staff_id = COALESCE(
      sale.price_finalised_by_staff_id,
      sale.updated_by_staff_id,
      sale.created_by_staff_id
    )
WHERE sale.price_finalised_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM contract_sale_invoices invoice
      WHERE invoice.sale_id = sale.id AND invoice.status <> 'void'
    )
    OR EXISTS (
      SELECT 1 FROM contract_sale_agreements agreement
      WHERE agreement.sale_id = sale.id AND agreement.status <> 'void'
    )
  );

CREATE OR REPLACE FUNCTION protect_contract_product_sale_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.sale_code IS DISTINCT FROM NEW.sale_code
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id
    OR OLD.opportunity_id IS DISTINCT FROM NEW.opportunity_id
    OR OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id
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
$$;

CREATE OR REPLACE FUNCTION update_contract_sale_overview(
  p_sale_id UUID,
  p_price_inc_gst_cents INTEGER,
  p_commencement_date DATE,
  p_notes TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sale_row contract_product_sales%ROWTYPE;
  has_documents BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts staff
    WHERE staff.id = p_actor_id
      AND staff.active = TRUE
      AND staff.role::TEXT = p_actor_role
      AND staff.role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
    RAISE EXCEPTION 'Actor is not authorized.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO sale_row
  FROM contract_product_sales
  WHERE id = p_sale_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;

  IF p_actor_role = 'agent' AND (
    sale_row.assigned_staff_id IS DISTINCT FROM p_actor_id
    OR NOT EXISTS (
      SELECT 1 FROM contract_products product
      WHERE product.id = sale_row.product_id
        AND product.state IS NOT DISTINCT FROM p_actor_state
    )
  ) THEN
    RAISE EXCEPTION 'Sale not found.' USING ERRCODE = '42501';
  END IF;

  IF sale_row.handover_at IS NOT NULL
    OR sale_row.status IN ('completed', 'cancelled', 'active_payment_plan') THEN
    RAISE EXCEPTION 'A completed, handed-over, or cancelled sale cannot be edited.';
  END IF;
  IF p_price_inc_gst_cents IS NULL
    OR p_price_inc_gst_cents <= sale_row.deposit_inc_gst_cents THEN
    RAISE EXCEPTION 'The final purchase price must exceed the deposit.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contract_sale_invoices invoice
    WHERE invoice.sale_id = p_sale_id AND invoice.status <> 'void'
    UNION ALL
    SELECT 1 FROM contract_sale_agreements agreement
    WHERE agreement.sale_id = p_sale_id AND agreement.status <> 'void'
  ) INTO has_documents;

  IF has_documents
    AND p_price_inc_gst_cents <> sale_row.agreed_purchase_price_inc_gst_cents THEN
    RAISE EXCEPTION 'The final purchase price is locked by an existing tax invoice or agreement snapshot.';
  END IF;

  UPDATE contract_product_sales
  SET agreed_purchase_price_inc_gst_cents = p_price_inc_gst_cents,
      commencement_date = p_commencement_date,
      internal_notes = NULLIF(TRIM(p_notes), ''),
      price_finalised_at = COALESCE(price_finalised_at, NOW()),
      price_finalised_by_staff_id = COALESCE(price_finalised_by_staff_id, p_actor_id),
      updated_by_staff_id = p_actor_id,
      updated_at = NOW()
  WHERE id = p_sale_id;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES (
    'contract_sale', p_sale_id::TEXT, 'contract_sale.price_finalised',
    jsonb_build_object(
      'actorId', p_actor_id,
      'actorRole', p_actor_role,
      'priceIncGstCents', p_price_inc_gst_cents,
      'priceChanged', p_price_inc_gst_cents <> sale_row.agreed_purchase_price_inc_gst_cents
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION enforce_contract_sale_invoice_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
      OR sale_row.price_finalised_at IS NULL
      OR NEW.total_inc_gst_cents <> sale_row.agreed_purchase_price_inc_gst_cents
      OR NEW.deposit_required_inc_gst_cents <> sale_row.deposit_inc_gst_cents THEN
      RAISE EXCEPTION 'The prepared tax invoice must match the finalised purchase price and deposit.';
    END IF;
  ELSIF NEW.invoice_type = 'deposit' THEN
    IF sale_row.status <> 'draft' OR NEW.total_inc_gst_cents <> sale_row.deposit_inc_gst_cents THEN
      RAISE EXCEPTION 'The fixed deposit can only be issued once from a draft sale.';
    END IF;
    UPDATE contract_product_sales
    SET status = 'deposit_due', updated_by_staff_id = NEW.issued_by_staff_id, updated_at = NOW()
    WHERE id = sale_row.id;
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
    UPDATE contract_product_sales
    SET status = 'balance_due', updated_by_staff_id = NEW.issued_by_staff_id, updated_at = NOW()
    WHERE id = sale_row.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_contract_sale_invoice_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
    OR OLD.invoice_title_snapshot IS DISTINCT FROM NEW.invoice_title_snapshot
    OR OLD.email_subject_template_snapshot IS DISTINCT FROM NEW.email_subject_template_snapshot
    OR OLD.email_intro_template_snapshot IS DISTINCT FROM NEW.email_intro_template_snapshot
    OR OLD.footer_note_snapshot IS DISTINCT FROM NEW.footer_note_snapshot
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
$$;

REVOKE ALL ON FUNCTION update_contract_sale_overview(UUID, INTEGER, DATE, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_contract_sale_overview(UUID, INTEGER, DATE, TEXT, UUID, TEXT, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION protect_contract_product_sale_snapshot()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_contract_sale_invoice_issue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_contract_sale_invoice_snapshot()
  FROM PUBLIC, anon, authenticated;

COMMIT;
