BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_sale_client_service_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'void')),
  content_snapshot TEXT NOT NULL,
  details_snapshot JSONB NOT NULL,
  scope_snapshot JSONB NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1 CHECK (template_version > 0),
  client_name_snapshot TEXT NOT NULL,
  client_email_snapshot TEXT,
  cleaner_name_snapshot TEXT NOT NULL,
  cleaner_email_snapshot TEXT,
  created_by_staff_id UUID NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_file_name TEXT,
  signed_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sale_id, version)
);

CREATE INDEX IF NOT EXISTS idx_contract_sale_client_service_agreements_sale
  ON public.contract_sale_client_service_agreements(sale_id, version DESC);

ALTER TABLE public.contract_sale_client_service_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - client service agreements"
  ON public.contract_sale_client_service_agreements;
CREATE POLICY "Service role full access - client service agreements"
  ON public.contract_sale_client_service_agreements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.contract_sale_client_service_agreements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contract_sale_client_service_agreements TO service_role;

CREATE OR REPLACE FUNCTION public.protect_client_service_agreement_snapshots()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sale_id IS DISTINCT FROM OLD.sale_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
     OR NEW.details_snapshot IS DISTINCT FROM OLD.details_snapshot
     OR NEW.scope_snapshot IS DISTINCT FROM OLD.scope_snapshot
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.client_name_snapshot IS DISTINCT FROM OLD.client_name_snapshot
     OR NEW.client_email_snapshot IS DISTINCT FROM OLD.client_email_snapshot
     OR NEW.cleaner_name_snapshot IS DISTINCT FROM OLD.cleaner_name_snapshot
     OR NEW.cleaner_email_snapshot IS DISTINCT FROM OLD.cleaner_email_snapshot
     OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Client service agreement snapshots are immutable';
  END IF;

  IF OLD.status IN ('signed', 'void') AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_file_name IS DISTINCT FROM OLD.signed_file_name
    OR NEW.signed_storage_path IS DISTINCT FROM OLD.signed_storage_path
  ) THEN
    RAISE EXCEPTION 'A signed or void client service agreement cannot be changed';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_service_agreement_snapshots
  ON public.contract_sale_client_service_agreements;
CREATE TRIGGER trg_protect_client_service_agreement_snapshots
  BEFORE UPDATE ON public.contract_sale_client_service_agreements
  FOR EACH ROW EXECUTE FUNCTION public.protect_client_service_agreement_snapshots();

REVOKE ALL ON FUNCTION public.protect_client_service_agreement_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_client_service_agreement_snapshots() TO service_role;

CREATE OR REPLACE FUNCTION public.complete_contract_sale_handover(
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
    NOT EXISTS (SELECT 1 FROM public.contract_products ap WHERE ap.id = sale_row.product_id AND public.agent_can_access_product_state(p_actor_id, ap.state))
    OR NOT EXISTS (SELECT 1 FROM contract_products WHERE id = sale_row.product_id AND state IS NOT DISTINCT FROM p_actor_state)
  ) THEN RAISE EXCEPTION 'Sale not found.' USING ERRCODE = '42501'; END IF;
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
  ) THEN RAISE EXCEPTION 'Upload the signed cleaner purchase agreement before handover.'; END IF;

  IF (product_row.formal_contract OR EXISTS (
    SELECT 1 FROM contract_sale_client_service_agreements
    WHERE sale_id = p_sale_id
  )) AND COALESCE((
    SELECT agreement.status
    FROM contract_sale_client_service_agreements agreement
    WHERE agreement.sale_id = p_sale_id
    ORDER BY agreement.version DESC
    LIMIT 1
  ), '') <> 'signed' THEN
    RAISE EXCEPTION 'Upload the signed latest client service agreement before handover.';
  END IF;

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

REVOKE ALL ON FUNCTION public.complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_contract_sale_handover(UUID, DATE, UUID, TEXT, TEXT) TO service_role;

COMMIT;
