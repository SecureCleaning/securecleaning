-- Apply after contract_sale_commissions_plans_migration.sql and
-- contract_sale_start_eligibility_repair_migration.sql.
BEGIN;

-- Assign future sales from durable workflow attribution. Ambiguous or non-agent
-- actors remain available for the existing owner review and assignment flow.
CREATE OR REPLACE FUNCTION auto_assign_contract_sale_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  win_agent uuid;
  sale_agent uuid;
  defaults contract_commission_settings%ROWTYPE;
  inserted_count integer;
BEGIN
  SELECT staff.id INTO win_agent
  FROM quotes quote
  JOIN admin_staff_accounts staff ON (
    (quote.final_quote_sent_by->>'kind' = 'staff_account' AND staff.id::text = quote.final_quote_sent_by->>'id')
    OR
    (quote.final_quote_sent_by->>'kind' = 'agent_session' AND staff.availability_assignee_id = quote.final_quote_sent_by->>'id')
  )
  WHERE quote.id = NEW.source_quote_id
    AND quote.final_quote_sent_at IS NOT NULL
    AND staff.active = true
    AND staff.role::text = 'agent'
  ORDER BY CASE WHEN quote.final_quote_sent_by->>'kind' = 'staff_account' THEN 0 ELSE 1 END, staff.id
  LIMIT 1;

  SELECT id INTO sale_agent
  FROM admin_staff_accounts
  WHERE id = NEW.created_by_staff_id AND active = true AND role::text = 'agent';

  IF win_agent IS NULL OR sale_agent IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO defaults FROM contract_commission_settings WHERE id FOR SHARE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO contract_commission_assignments(
    sale_id, win_agent_id, sale_agent_id, win_bps, sale_bps, created_by, created_at
  ) VALUES (
    NEW.id, win_agent, sale_agent, defaults.win_bps, defaults.sale_bps, NEW.created_by_staff_id, now()
  ) ON CONFLICT (sale_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 1 THEN
    INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
    VALUES ('commission', NEW.id::text, 'commission.auto_assigned', jsonb_build_object(
      'quoteId', NEW.source_quote_id,
      'winAgentId', win_agent,
      'saleAgentId', sale_agent,
      'winBps', defaults.win_bps,
      'saleBps', defaults.sale_bps
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_contract_sale_commission ON contract_product_sales;
CREATE TRIGGER trg_auto_assign_contract_sale_commission
AFTER INSERT ON contract_product_sales
FOR EACH ROW EXECUTE FUNCTION auto_assign_contract_sale_commission();

-- Claims and payouts remain fully immutable. An assignment can be corrected only
-- through the owner RPC, and only before an agent has invoiced any commission.
CREATE OR REPLACE FUNCTION protect_contract_commission_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR current_setting('app.commission_assignment_correction', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Commission assignments are immutable outside the owner correction workflow.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_commission_entry ON contract_commission_assignments;
CREATE TRIGGER protect_commission_entry
BEFORE UPDATE OR DELETE ON contract_commission_assignments
FOR EACH ROW EXECUTE FUNCTION protect_contract_commission_assignment();

CREATE OR REPLACE FUNCTION manage_contract_commission(p_actor_id uuid,p_action text,p_input jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_role text; sid uuid; aid uuid; amount integer; rid uuid; balance record; replay record; defaults record; w uuid; a uuid; prior record;
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
 ELSIF p_action='correct' THEN
  IF actor_role<>'owner' THEN RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501'; END IF;
  sid:=(p_input->>'saleId')::uuid; w:=(p_input->>'winAgentId')::uuid; a:=(p_input->>'saleAgentId')::uuid;
  PERFORM 1 FROM contract_product_sales WHERE id=sid AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active sale not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=w AND active AND role::text='agent') OR NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=a AND active AND role::text='agent') THEN RAISE EXCEPTION 'Select active agents.'; END IF;
  SELECT * INTO prior FROM contract_commission_assignments WHERE sale_id=sid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission assignment not found.'; END IF;
  IF EXISTS(SELECT 1 FROM contract_commission_claims WHERE sale_id=sid) OR EXISTS(SELECT 1 FROM contract_commission_payouts WHERE sale_id=sid) THEN
   RAISE EXCEPTION 'Commission assignment cannot be corrected after an agent invoice or payout exists.';
  END IF;
  IF prior.win_agent_id=w AND prior.sale_agent_id=a THEN RETURN; END IF;
  PERFORM set_config('app.commission_assignment_correction','allowed',true);
  UPDATE contract_commission_assignments SET win_agent_id=w,sale_agent_id=a WHERE sale_id=sid;
  INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('commission',sid::text,'commission.assignment_corrected',jsonb_build_object(
    'actorId',p_actor_id,'previousWinAgentId',prior.win_agent_id,'previousSaleAgentId',prior.sale_agent_id,
    'winAgentId',w,'saleAgentId',a,'winBps',prior.win_bps,'saleBps',prior.sale_bps));
  RETURN;
 ELSIF p_action IN ('claim','payout') THEN
  sid:=(p_input->>'saleId')::uuid; aid:=CASE WHEN actor_role='agent' THEN p_actor_id ELSE (p_input->>'agentId')::uuid END;
  IF p_action='payout' AND actor_role<>'owner' THEN RAISE EXCEPTION 'Only owner can record payment.' USING ERRCODE='42501'; END IF;
  IF p_action='claim' AND actor_role<>'agent' THEN RAISE EXCEPTION 'Agent invoice submission required.' USING ERRCODE='42501'; END IF;
  amount:=(p_input->>'amountCents')::integer; rid:=(p_input->>'requestId')::uuid;
  IF amount IS NULL OR amount<=0 OR rid IS NULL THEN RAISE EXCEPTION 'Positive amount and request ID required.'; END IF;
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

REVOKE ALL ON FUNCTION auto_assign_contract_sale_commission() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION protect_contract_commission_assignment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION manage_contract_commission(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION manage_contract_commission(uuid,text,jsonb) TO service_role;

COMMIT;
