-- Product and sale access is shared by active agents in the product's state.
-- Attribution and commission assignments are not changed.
CREATE OR REPLACE FUNCTION public.agent_can_access_product_state(p_actor_id uuid, p_state text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts staff
    JOIN availability_private_config config ON config.key = 'availability.config'
    CROSS JOIN LATERAL jsonb_array_elements(config.content::jsonb->'assignees') agent
    WHERE staff.id = p_actor_id AND staff.active = TRUE AND staff.role::text = 'agent'
      AND staff.availability_assignee_id = agent->>'id'
      AND COALESCE((agent->>'active')::boolean, false)
      AND p_state IN ('NSW', 'VIC')
      AND CASE agent->>'city' WHEN 'sydney' THEN 'NSW' WHEN 'melbourne' THEN 'VIC' END = p_state
  );
$$;
REVOKE ALL ON FUNCTION public.agent_can_access_product_state(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_can_access_product_state(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_contract_product_sale(p_sale_id uuid, p_reason text, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE sale_row contract_product_sales%ROWTYPE;
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
$function$
;
REVOKE ALL ON FUNCTION public.cancel_contract_product_sale(p_sale_id uuid, p_reason text, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_contract_product_sale(p_sale_id uuid, p_reason text, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_contract_sale_handover(p_sale_id uuid, p_commenced_on date, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    NOT EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id = sale_row.product_id AND public.agent_can_access_product_state(p_actor_id, ap.state)) OR NOT EXISTS (
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
$function$
;
REVOKE ALL ON FUNCTION public.complete_contract_sale_handover(p_sale_id uuid, p_commenced_on date, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_contract_sale_handover(p_sale_id uuid, p_commenced_on date, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_contract_product_sale(p_product_id uuid, p_cleaner_id uuid, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    NOT public.agent_can_access_product_state(p_actor_id, product_row.state) OR product_row.state IS DISTINCT FROM p_actor_state
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
$function$
;
REVOKE ALL ON FUNCTION public.create_contract_product_sale(p_product_id uuid, p_cleaner_id uuid, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_product_sale(p_product_id uuid, p_cleaner_id uuid, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;

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
  IF schedule_count < 2 OR schedule_count > 24
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

CREATE OR REPLACE FUNCTION public.guard_contract_sale_checklist_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Checklist upload history is immutable.'; END IF;
  PERFORM 1 FROM admin_staff_accounts WHERE id=NEW.uploaded_by_staff_id AND active AND role::text IN ('owner','manager','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checklist uploader access denied.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM contract_product_sales s WHERE s.id=NEW.sale_id AND s.handover_at IS NOT NULL
    AND (EXISTS(SELECT 1 FROM admin_staff_accounts a WHERE a.id=NEW.uploaded_by_staff_id AND a.role::text IN ('owner','manager')) OR EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id=s.product_id AND public.agent_can_access_product_state(NEW.uploaded_by_staff_id,ap.state))) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete handover before uploading the checklist.'; END IF;
  RETURN NEW;
END $function$
;
REVOKE ALL ON FUNCTION public.guard_contract_sale_checklist_upload() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_contract_sale_checklist_upload() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_contract_sale_inspection_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Inspection message history is immutable.'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.delivery_status <> 'unknown'
      OR (to_jsonb(NEW) - ARRAY['delivery_status','provider_message_id','delivery_error']::text[])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['delivery_status','provider_message_id','delivery_error']::text[])
    THEN RAISE EXCEPTION 'Only an unresolved inspection message delivery outcome may be finalized.'; END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM admin_staff_accounts WHERE id=NEW.sender_staff_id AND active AND role::text IN ('owner','manager','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection sender access denied.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM contract_product_sales s WHERE s.id=NEW.sale_id AND s.status::text<>'cancelled'
    AND (EXISTS(SELECT 1 FROM admin_staff_accounts a WHERE a.id=NEW.sender_staff_id AND a.role::text IN ('owner','manager')) OR EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id=s.product_id AND public.agent_can_access_product_state(NEW.sender_staff_id,ap.state))) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $function$
;
REVOKE ALL ON FUNCTION public.guard_contract_sale_inspection_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_contract_sale_inspection_message() TO service_role;

CREATE OR REPLACE FUNCTION public.publish_contract_product(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  product_row contract_products%ROWTYPE;
  next_version INTEGER;
  actor_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) INTO actor_is_valid;
  IF NOT actor_is_valid THEN RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO product_row FROM contract_products WHERE id = p_product_id FOR UPDATE;
  IF product_row.id IS NULL THEN RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002'; END IF;
  IF p_actor_role = 'agent' AND NOT public.agent_can_access_product_state(p_actor_id, product_row.state) THEN
    RAISE EXCEPTION 'product not assigned to agent' USING ERRCODE = '42501';
  END IF;
  IF p_actor_role = 'agent' AND product_row.state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'product state is outside agent region' USING ERRCODE = '42501';
  END IF;
  IF product_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'product changed while editing' USING ERRCODE = '40001';
  END IF;
  IF product_row.status NOT IN ('draft', 'withdrawn', 'available') THEN
    RAISE EXCEPTION 'product cannot be published from this status' USING ERRCODE = '23514';
  END IF;
  IF BTRIM(product_row.heading) = '' OR BTRIM(product_row.description) = '' OR BTRIM(product_row.suburb) = ''
     OR product_row.annual_visits <= 0 OR product_row.purchase_price_ex_gst_cents <= 0
     OR jsonb_typeof(product_row.cleaner_scope_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'product is not ready to publish' USING ERRCODE = '23514';
  END IF;

  next_version := product_row.version + 1;
  UPDATE contract_products SET
    status = 'available', version = next_version,
    listed_at = COALESCE(listed_at, NOW()), withdrawn_at = NULL,
    published_by_staff_id = p_actor_id, updated_at = NOW()
  WHERE id = p_product_id;

  SELECT * INTO product_row FROM contract_products WHERE id = p_product_id;

  INSERT INTO contract_product_versions(product_id, version, listing_snapshot, published_by_staff_id)
  VALUES (p_product_id, next_version, to_jsonb(product_row) - 'pricing_note' - 'acceptance_note', p_actor_id)
  ON CONFLICT (product_id, version) DO NOTHING;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', p_product_id::TEXT, 'contract_product.published',
    jsonb_build_object('version', next_version, 'actorId', p_actor_id));
  RETURN next_version;
END;
$function$
;
REVOKE ALL ON FUNCTION public.publish_contract_product(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_contract_product(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_contract_product_cleaner_scope(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_source_quote_document_version integer, p_cleaner_scope_snapshot jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
product_row contract_products%ROWTYPE;
source_inputs JSONB;
source_state TEXT;
refreshed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role AND role::TEXT IN ('owner', 'manager', 'agent')) THEN
RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
END IF;
SELECT * INTO product_row FROM contract_products WHERE id = p_product_id FOR UPDATE;
IF product_row.id IS NULL THEN
RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
END IF;
IF product_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
RAISE EXCEPTION 'product changed while editing' USING ERRCODE = '40001';
END IF;
IF product_row.status NOT IN ('draft', 'withdrawn') THEN
RAISE EXCEPTION 'product scope cannot be refreshed from this status' USING ERRCODE = '23514';
END IF;
IF p_actor_role = 'agent' AND (NOT public.agent_can_access_product_state(p_actor_id, product_row.state) OR product_row.state IS DISTINCT FROM p_actor_state) THEN
RAISE EXCEPTION 'product outside agent access' USING ERRCODE = '42501';
END IF;
IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object' OR jsonb_typeof(p_cleaner_scope_snapshot->'rooms') <> 'array' OR jsonb_array_length(p_cleaner_scope_snapshot->'rooms') = 0 THEN
RAISE EXCEPTION 'cleaner scope snapshot is incomplete' USING ERRCODE = '23514';
END IF;
SELECT COALESCE(final_quote_document->'inputs', firm_quote_workflow->'revisedInputs', inputs) INTO source_inputs FROM quotes WHERE id = product_row.source_quote_id FOR SHARE;
IF source_inputs IS NULL OR jsonb_typeof(source_inputs) <> 'object' THEN
RAISE EXCEPTION 'winning quote snapshot unavailable' USING ERRCODE = '23514';
END IF;
source_state := CASE LOWER(BTRIM(COALESCE(source_inputs->>'city', ''))) WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' ELSE NULL END;
IF UPPER(BTRIM(COALESCE(p_cleaner_scope_snapshot->>'state', ''))) IS DISTINCT FROM source_state
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'suburb', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'suburb', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'premisesType', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'premisesType', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'frequency', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'frequency', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'timePreference', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'timePreference', '')) THEN
RAISE EXCEPTION 'cleaner scope does not match winning quote' USING ERRCODE = '23514';
END IF;
IF COALESCE(source_inputs->>'timePreference', '') NOT IN ('business_hours', 'after_hours', 'weekend') THEN
RAISE EXCEPTION 'winning quote cleaning timing invalid' USING ERRCODE = '23514';
END IF;
UPDATE contract_products SET cleaner_scope_snapshot = p_cleaner_scope_snapshot, time_preference = source_inputs->>'timePreference', source_quote_document_version = GREATEST(1, p_source_quote_document_version), updated_at = refreshed_at WHERE id = p_product_id RETURNING updated_at INTO refreshed_at;
INSERT INTO admin_audit_log(entity_type, entity_ref, action, details) VALUES ('contract_product', p_product_id::TEXT, 'contract_product.scope_refreshed_from_winning_quote', jsonb_build_object('quoteId', product_row.source_quote_id, 'actorId', p_actor_id, 'sourceQuoteDocumentVersion', GREATEST(1, p_source_quote_document_version)));
RETURN refreshed_at;
END;
$function$
;
REVOKE ALL ON FUNCTION public.refresh_contract_product_cleaner_scope(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_source_quote_document_version integer, p_cleaner_scope_snapshot jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_contract_product_cleaner_scope(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_source_quote_document_version integer, p_cleaner_scope_snapshot jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_contract_sale_cleaner_profile_request(p_cleaner_id uuid, p_sale_id uuid, p_invoice_id uuid, p_actor_id uuid, p_subject_snapshot text, p_body_text_snapshot text, p_body_html_snapshot text, p_body_document_snapshot jsonb, p_final_html_snapshot text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  actor_role TEXT;
  sale_row public.contract_product_sales%ROWTYPE;
  invoice_row public.contract_sale_invoices%ROWTYPE;
  cleaner_email TEXT;
  copied_agent UUID;
  copied_email TEXT;
  request_id UUID;
BEGIN
  SELECT role::TEXT INTO actor_role
  FROM public.admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE;
  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_cleaner_id::TEXT, 0));
  SELECT * INTO sale_row FROM public.contract_product_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR sale_row.cleaner_id IS DISTINCT FROM p_cleaner_id OR sale_row.status::TEXT = 'cancelled' THEN
    RAISE EXCEPTION 'Active product sale not found.' USING ERRCODE = '42501';
  END IF;
  IF actor_role = 'agent' AND NOT EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id = sale_row.product_id AND public.agent_can_access_product_state(p_actor_id, ap.state)) THEN
    RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invoice_row FROM public.contract_sale_invoices
  WHERE id = p_invoice_id AND sale_id = p_sale_id AND invoice_type::TEXT = 'sale' FOR UPDATE;
  IF NOT FOUND OR invoice_row.delivery_status::TEXT <> 'sent' THEN
    RAISE EXCEPTION 'The first sale invoice must be sent before requesting cleaner details.';
  END IF;

  SELECT LOWER(BTRIM(email)) INTO cleaner_email FROM public.cleaners WHERE id = p_cleaner_id;
  IF cleaner_email IS NULL OR cleaner_email <> LOWER(BTRIM(invoice_row.recipient_email_snapshot)) THEN
    RAISE EXCEPTION 'Cleaner and invoice recipients do not match.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contract_sale_cleaner_profile_requests
    WHERE cleaner_id = p_cleaner_id
  ) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.contract_sale_invoices prior_invoice
    JOIN public.contract_product_sales prior_sale ON prior_sale.id = prior_invoice.sale_id
    WHERE prior_sale.cleaner_id = p_cleaner_id
      AND prior_invoice.id <> p_invoice_id
      AND prior_invoice.delivery_status::TEXT = 'sent'
      AND (
        prior_invoice.issued_at < invoice_row.issued_at
        OR (prior_invoice.issued_at = invoice_row.issued_at AND prior_invoice.id::TEXT < invoice_row.id::TEXT)
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT id, LOWER(BTRIM(email)) INTO copied_agent, copied_email
  FROM public.admin_staff_accounts
  WHERE id = sale_row.created_by_staff_id
    AND active = TRUE
    AND role::TEXT = 'agent'
    AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

  INSERT INTO public.contract_sale_cleaner_profile_requests(
    cleaner_id, sale_id, invoice_id, triggered_by_staff_id, copied_agent_id,
    recipient_email_snapshot, copied_email_snapshot, subject_snapshot,
    body_text_snapshot, body_html_snapshot, body_document_snapshot, final_html_snapshot
  ) VALUES (
    p_cleaner_id, p_sale_id, p_invoice_id, p_actor_id, copied_agent,
    cleaner_email, copied_email, p_subject_snapshot,
    p_body_text_snapshot, p_body_html_snapshot, p_body_document_snapshot, p_final_html_snapshot
  ) RETURNING id INTO request_id;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', p_sale_id::TEXT, 'contract_sale.cleaner_profile_email.reserved', jsonb_build_object(
    'actorId', p_actor_id,
    'cleanerId', p_cleaner_id,
    'invoiceId', p_invoice_id,
    'requestId', request_id,
    'copiedSaleCreator', copied_agent IS NOT NULL
  ));
  RETURN request_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.reserve_contract_sale_cleaner_profile_request(p_cleaner_id uuid, p_sale_id uuid, p_invoice_id uuid, p_actor_id uuid, p_subject_snapshot text, p_body_text_snapshot text, p_body_html_snapshot text, p_body_document_snapshot jsonb, p_final_html_snapshot text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contract_sale_cleaner_profile_request(p_cleaner_id uuid, p_sale_id uuid, p_invoice_id uuid, p_actor_id uuid, p_subject_snapshot text, p_body_text_snapshot text, p_body_html_snapshot text, p_body_document_snapshot jsonb, p_final_html_snapshot text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_contract_sale_overview(p_sale_id uuid, p_price_inc_gst_cents integer, p_commencement_date date, p_notes text, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    NOT EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id = sale_row.product_id AND public.agent_can_access_product_state(p_actor_id, ap.state))
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
$function$
;
REVOKE ALL ON FUNCTION public.update_contract_sale_overview(p_sale_id uuid, p_price_inc_gst_cents integer, p_commencement_date date, p_notes text, p_actor_id uuid, p_actor_role text, p_actor_state text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_contract_sale_overview(p_sale_id uuid, p_price_inc_gst_cents integer, p_commencement_date date, p_notes text, p_actor_id uuid, p_actor_role text, p_actor_state text) TO service_role;
