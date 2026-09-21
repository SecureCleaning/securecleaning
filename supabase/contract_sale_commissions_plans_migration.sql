-- Apply after contract_sale_document_bundle_workflow_migration.sql and invoice_email_rich_text_migration.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS contract_commission_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), win_bps integer NOT NULL DEFAULT 2500 CHECK(win_bps BETWEEN 0 AND 10000),
 sale_bps integer NOT NULL DEFAULT 2500 CHECK(sale_bps BETWEEN 0 AND 10000), CHECK(win_bps+sale_bps<=10000)
);
INSERT INTO contract_commission_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS contract_commission_assignments (
 sale_id uuid PRIMARY KEY REFERENCES contract_product_sales(id) ON DELETE RESTRICT,
 win_agent_id uuid NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
 sale_agent_id uuid NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
 win_bps integer NOT NULL CHECK(win_bps BETWEEN 0 AND 10000), sale_bps integer NOT NULL CHECK(sale_bps BETWEEN 0 AND 10000),
 created_by uuid NOT NULL REFERENCES admin_staff_accounts(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(win_bps+sale_bps<=10000)
);
CREATE TABLE IF NOT EXISTS contract_commission_claims (
 id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES contract_commission_assignments(sale_id),
 agent_id uuid NOT NULL REFERENCES admin_staff_accounts(id), amount_cents integer NOT NULL CHECK(amount_cents>0),
 invoice_reference text NOT NULL CHECK(length(trim(invoice_reference)) BETWEEN 1 AND 160), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contract_commission_payouts (
 id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES contract_commission_assignments(sale_id),
 agent_id uuid NOT NULL REFERENCES admin_staff_accounts(id), amount_cents integer NOT NULL CHECK(amount_cents>0),
 paid_on date NOT NULL, reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160),
 recorded_by uuid NOT NULL REFERENCES admin_staff_accounts(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- Immutable entries preserve rates, agent attribution, submitted invoices and payout evidence.
CREATE OR REPLACE FUNCTION protect_contract_commission_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commission records are immutable.'; END; $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['contract_commission_assignments','contract_commission_claims','contract_commission_payouts'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS protect_commission_entry ON %I',t);
 EXECUTE format('CREATE TRIGGER protect_commission_entry BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_contract_commission_entry()',t);
 END LOOP;
END $$;

ALTER TABLE contract_sale_payment_plans ADD COLUMN IF NOT EXISTS opening_paid_cents integer NOT NULL DEFAULT 0 CHECK(opening_paid_cents>=0);
UPDATE contract_sale_payment_plans p SET opening_paid_cents=greatest(0,i.total_inc_gst_cents-s.total)::integer FROM contract_sale_invoices i, (SELECT payment_plan_id,sum(amount_cents) total FROM contract_sale_payment_plan_instalments GROUP BY payment_plan_id) s WHERE p.id=s.payment_plan_id AND i.id=p.balance_invoice_id AND p.opening_paid_cents=0;
ALTER TABLE contract_sale_payment_plans DROP CONSTRAINT IF EXISTS contract_sale_payment_plans_status_check;
ALTER TABLE contract_sale_payment_plans ADD CONSTRAINT contract_sale_payment_plans_status_check CHECK(status IN ('awaiting_acceptance','active','completed','cancelled','defaulted'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_sale_plan_pending ON contract_sale_payment_plans(sale_id) WHERE status='awaiting_acceptance';
ALTER TABLE contract_sale_agreements ADD COLUMN IF NOT EXISTS payment_plan_id uuid REFERENCES contract_sale_payment_plans(id) ON DELETE RESTRICT;

CREATE OR REPLACE VIEW contract_commission_balances AS
WITH receipts AS (
 SELECT i.sale_id, sum(i.total_inc_gst_cents)::bigint gross, sum(i.total_inc_gst_cents-i.gst_component_cents)::bigint net,
 sum(coalesce(p.paid,0))::bigint paid
 FROM contract_sale_invoices i LEFT JOIN LATERAL (SELECT sum(amount_cents) paid FROM contract_sale_payment_allocations WHERE invoice_id=i.id) p ON true
 WHERE i.status<>'void' GROUP BY i.sale_id
), roles AS (
 SELECT sale_id,win_agent_id agent_id,'win' component,win_bps win_rate,win_bps+sale_bps total_rate FROM contract_commission_assignments
 UNION ALL SELECT sale_id,sale_agent_id,'sale',win_bps,win_bps+sale_bps FROM contract_commission_assignments
), amounts AS (
 SELECT r.*,round(coalesce(p.net,0)::numeric*r.total_rate/10000) potential,
 CASE WHEN s.status='cancelled' THEN 0 WHEN p.gross>0 AND (p.paid>=p.gross OR EXISTS (
   SELECT 1 FROM contract_sale_payment_plans plan WHERE plan.sale_id=s.id AND plan.status IN ('active','completed') AND EXISTS(SELECT 1 FROM contract_sale_agreements ag WHERE ag.payment_plan_id=plan.id AND ag.status='signed')
 )) THEN round(p.net::numeric*r.total_rate*least(p.paid,p.gross)/(10000*p.gross)) ELSE 0 END earned,
 p.paid receipts
 FROM roles r JOIN contract_product_sales s ON s.id=r.sale_id LEFT JOIN receipts p ON p.sale_id=r.sale_id
), totals AS (
 -- First round the combined entitlement, then divide those earned cents by the locked weights.
 -- As receipts grow, each extra combined cent goes to exactly one beneficiary: neither share decreases.
 SELECT sale_id,agent_id,
 sum(CASE WHEN total_rate=0 THEN 0 WHEN component='win' THEN round(potential*win_rate/total_rate) ELSE potential-round(potential*win_rate/total_rate) END)::bigint potential_cents,
 sum(CASE WHEN total_rate=0 THEN 0 WHEN component='win' THEN round(earned*win_rate/total_rate) ELSE earned-round(earned*win_rate/total_rate) END)::bigint earned_cents,
 max(receipts) receipts_cents
 FROM amounts GROUP BY sale_id,agent_id
)
SELECT t.*,s.sale_code,s.product_id,
 coalesce((SELECT sum(amount_cents) FROM contract_commission_claims c WHERE c.sale_id=t.sale_id AND c.agent_id=t.agent_id),0)::bigint claimed_cents,
 coalesce((SELECT sum(amount_cents) FROM contract_commission_payouts p WHERE p.sale_id=t.sale_id AND p.agent_id=t.agent_id),0)::bigint paid_cents
FROM totals t JOIN contract_product_sales s ON s.id=t.sale_id;

CREATE OR REPLACE FUNCTION manage_contract_commission(p_actor_id uuid,p_action text,p_input jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_role text; sid uuid; aid uuid; amount integer; rid uuid; balance record; replay record; defaults record; w uuid; a uuid;
BEGIN
 SELECT role::text INTO actor_role FROM admin_staff_accounts WHERE id=p_actor_id AND active;
 IF actor_role IS NULL OR actor_role NOT IN ('owner','agent') THEN RAISE EXCEPTION 'Commission access denied.' USING ERRCODE='42501'; END IF;
 IF p_action='settings' THEN
  IF actor_role<>'owner' THEN RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501'; END IF;
  UPDATE contract_commission_settings SET win_bps=(p_input->>'winBps')::integer,sale_bps=(p_input->>'saleBps')::integer WHERE id;
 ELSIF p_action='assign' THEN
  IF actor_role<>'owner' THEN RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501'; END IF;
  sid:=(p_input->>'saleId')::uuid; w:=(p_input->>'winAgentId')::uuid; a:=(p_input->>'saleAgentId')::uuid;
  PERFORM 1 FROM contract_product_sales WHERE id=sid AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active sale not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=w AND active AND role::text='agent') OR NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=a AND active AND role::text='agent') THEN RAISE EXCEPTION 'Select active agents.'; END IF;
  SELECT * INTO defaults FROM contract_commission_settings WHERE id FOR SHARE;
  IF (p_input->>'expectedWinBps')::integer IS DISTINCT FROM defaults.win_bps OR (p_input->>'expectedSaleBps')::integer IS DISTINCT FROM defaults.sale_bps THEN RAISE EXCEPTION 'Commission defaults changed. Refresh and review rates.'; END IF;
  IF EXISTS(SELECT 1 FROM contract_commission_assignments WHERE sale_id=sid) THEN
   IF EXISTS(SELECT 1 FROM contract_commission_assignments WHERE sale_id=sid AND win_agent_id=w AND sale_agent_id=a) THEN RETURN; END IF;
   RAISE EXCEPTION 'Commission assignments are already locked.';
  END IF;
  INSERT INTO contract_commission_assignments VALUES(sid,w,a,defaults.win_bps,defaults.sale_bps,p_actor_id,now());
 ELSIF p_action IN ('claim','payout') THEN
  sid:=(p_input->>'saleId')::uuid; aid:=CASE WHEN actor_role='agent' THEN p_actor_id ELSE (p_input->>'agentId')::uuid END;
  IF p_action='payout' AND actor_role<>'owner' THEN RAISE EXCEPTION 'Only owner can record payment.' USING ERRCODE='42501'; END IF;
  IF p_action='claim' AND actor_role<>'agent' THEN RAISE EXCEPTION 'Agent invoice submission required.' USING ERRCODE='42501'; END IF;
  amount:=(p_input->>'amountCents')::integer; rid:=(p_input->>'requestId')::uuid;
  IF amount IS NULL OR amount<=0 OR rid IS NULL THEN RAISE EXCEPTION 'Positive amount and request ID required.'; END IF;
  -- Serialize with payment confirmation/cancellation and other payouts.
  PERFORM 1 FROM contract_product_sales WHERE id=sid FOR UPDATE;
  PERFORM 1 FROM contract_commission_assignments WHERE sale_id=sid FOR UPDATE;
  IF p_action='claim' THEN
   SELECT * INTO replay FROM contract_commission_claims WHERE id=rid;
   IF FOUND THEN
    IF replay.sale_id=sid AND replay.agent_id=aid AND replay.amount_cents=amount AND replay.invoice_reference=p_input->>'reference' THEN RETURN; END IF;
    RAISE EXCEPTION 'Request ID was used for different details.';
   END IF;
  ELSE
   SELECT * INTO replay FROM contract_commission_payouts WHERE id=rid;
   IF FOUND THEN
    IF replay.sale_id=sid AND replay.agent_id=aid AND replay.amount_cents=amount AND replay.reference=p_input->>'reference' AND replay.paid_on=(p_input->>'paidOn')::date THEN RETURN; END IF;
    RAISE EXCEPTION 'Request ID was used for different details.';
   END IF;
  END IF;
  SELECT * INTO balance FROM contract_commission_balances WHERE sale_id=sid AND agent_id=aid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found.' USING ERRCODE='42501'; END IF;
  IF p_action='claim' THEN
   IF amount>balance.earned_cents-balance.claimed_cents THEN RAISE EXCEPTION 'Amount exceeds commission available to invoice.'; END IF;
   INSERT INTO contract_commission_claims VALUES(rid,sid,aid,amount,p_input->>'reference',now());
  ELSE
   IF amount>least(balance.earned_cents,balance.claimed_cents)-balance.paid_cents THEN RAISE EXCEPTION 'Amount exceeds invoiced, unpaid commission.'; END IF;
   INSERT INTO contract_commission_payouts VALUES(rid,sid,aid,amount,(p_input->>'paidOn')::date,p_input->>'reference',p_actor_id,now());
  END IF;
 ELSE RAISE EXCEPTION 'Invalid commission action.'; END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('commission',coalesce(sid::text,'defaults'),'commission.'||p_action,jsonb_build_object('actorId',p_actor_id,'input',p_input));
END $$;

-- A plan is agent-approved at preparation, and becomes active only when its linked agreement is signed.
CREATE OR REPLACE FUNCTION activate_signed_contract_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.payment_plan_id IS DISTINCT FROM NEW.payment_plan_id THEN RAISE EXCEPTION 'Agreement plan link is immutable.'; END IF;
 IF NEW.payment_plan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE id=NEW.payment_plan_id AND sale_id=NEW.sale_id) THEN RAISE EXCEPTION 'Plan does not belong to agreement sale.'; END IF;
 IF NEW.status='signed' AND NEW.payment_plan_id IS NOT NULL THEN
  PERFORM 1 FROM contract_product_sales WHERE id=NEW.sale_id AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cancelled sale cannot activate a payment plan.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM contract_sale_payment_plans WHERE id=NEW.payment_plan_id AND status IN ('awaiting_acceptance','active','completed')) THEN RAISE EXCEPTION 'This payment plan was superseded. Use the latest agreement.'; END IF;
  UPDATE contract_sale_payment_plans SET status='cancelled',updated_at=now() WHERE sale_id=NEW.sale_id AND status='active' AND id<>NEW.payment_plan_id;
  UPDATE contract_sale_payment_plans SET status='active',updated_at=now() WHERE id=NEW.payment_plan_id AND status='awaiting_acceptance';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activate_signed_contract_plan ON contract_sale_agreements;
CREATE TRIGGER trg_activate_signed_contract_plan BEFORE INSERT OR UPDATE ON contract_sale_agreements FOR EACH ROW EXECUTE FUNCTION activate_signed_contract_plan();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['contract_commission_settings','contract_commission_assignments','contract_commission_claims','contract_commission_payouts'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I TO service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON contract_commission_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON contract_commission_balances TO service_role;
REVOKE ALL ON FUNCTION manage_contract_commission(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION manage_contract_commission(uuid,text,jsonb) TO service_role;
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
$$;


REVOKE ALL ON FUNCTION create_contract_sale_payment_plan(uuid,uuid,text,jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_contract_sale_payment_plan(uuid,uuid,text,jsonb,uuid,text,text) TO service_role;
COMMIT;
