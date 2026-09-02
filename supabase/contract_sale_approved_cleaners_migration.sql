BEGIN;

-- Compliance is tracked independently from sale eligibility. An agent may start
-- or complete a sale for any cleaner whose workflow status is approved and whose
-- state matches the product.
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
  IF NOT FOUND OR cleaner_row.status <> 'approved' THEN
    RAISE EXCEPTION 'The cleaner must be approved before a sale can begin.';
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

REVOKE ALL ON FUNCTION create_contract_product_sale(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_contract_product_sale(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) TO service_role;

COMMIT;
