BEGIN;
CREATE TABLE contract_commission_received_invoices (
 id uuid PRIMARY KEY,
 agent_id uuid NOT NULL REFERENCES admin_staff_accounts(id),
 invoice_reference text NOT NULL CHECK(length(trim(invoice_reference)) BETWEEN 1 AND 160),
 invoice_date date NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 storage_path text,
 content_type text CHECK(content_type IN ('application/pdf','image/png','image/jpeg')),
 recorded_by uuid NOT NULL REFERENCES admin_staff_accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 request_payload jsonb NOT NULL
);
CREATE UNIQUE INDEX commission_received_invoice_reference ON contract_commission_received_invoices(agent_id,lower(trim(invoice_reference)));
CREATE TABLE contract_commission_invoice_allocations (
 invoice_id uuid NOT NULL REFERENCES contract_commission_received_invoices(id),
 claim_id uuid PRIMARY KEY REFERENCES contract_commission_claims(id)
);
ALTER TABLE contract_commission_received_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_commission_invoice_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contract_commission_received_invoices,contract_commission_invoice_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON contract_commission_received_invoices,contract_commission_invoice_allocations TO service_role;
CREATE TRIGGER protect_commission_invoice BEFORE UPDATE OR DELETE ON contract_commission_received_invoices FOR EACH ROW EXECUTE FUNCTION protect_contract_commission_entry();
CREATE TRIGGER protect_commission_invoice_allocation BEFORE UPDATE OR DELETE ON contract_commission_invoice_allocations FOR EACH ROW EXECUTE FUNCTION protect_contract_commission_entry();
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('commission-invoices','commission-invoices',false,3145728,ARRAY['application/pdf','image/png','image/jpeg']);

CREATE FUNCTION record_received_commission_invoice(p_actor_id uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE iid uuid; aid uuid; sid uuid; cid uuid; item jsonb; balance record; old record; total bigint; amount integer; ref text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner') THEN
  RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501';
 END IF;
 iid:=(p_input->>'requestId')::uuid; aid:=(p_input->>'agentId')::uuid; ref:=trim(p_input->>'reference');
 IF iid IS NULL OR aid IS NULL OR ref IS NULL OR length(ref) NOT BETWEEN 1 AND 160 OR p_input->>'invoiceDate' IS NULL
  OR jsonb_typeof(p_input->'allocations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid invoice details.'; END IF;
 IF jsonb_array_length(p_input->'allocations') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select between 1 and 100 sales.'; END IF;
 -- Serialize receipts for this agent, including duplicate invoice submissions.
 PERFORM 1 FROM admin_staff_accounts WHERE id=aid AND role::text='agent' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found.'; END IF;
 SELECT * INTO old FROM contract_commission_received_invoices WHERE id=iid;
 IF FOUND THEN
  IF old.recorded_by=p_actor_id AND old.request_payload=p_input THEN RETURN iid; END IF;
  RAISE EXCEPTION 'Request already used for different invoice details.';
 END IF;
 IF EXISTS(SELECT 1 FROM contract_commission_claims WHERE agent_id=aid AND lower(trim(invoice_reference))=lower(ref)) THEN
  RAISE EXCEPTION 'This agent invoice reference has already been recorded.';
 END IF;
 IF (SELECT count(DISTINCT (x->>'saleId')::uuid) FROM jsonb_array_elements(p_input->'allocations') x) <> jsonb_array_length(p_input->'allocations') THEN
  RAISE EXCEPTION 'Each sale must appear only once.';
 END IF;
 SELECT sum((x->>'amountCents')::integer) INTO total FROM jsonb_array_elements(p_input->'allocations') x;
 IF total IS NULL OR total<=0 OR total>2147483647 OR total IS DISTINCT FROM (p_input->>'amountCents')::bigint THEN RAISE EXCEPTION 'Allocations must equal invoice amount.'; END IF;
 IF p_input->>'storagePath' IS NOT NULL AND (
   p_input->>'storagePath' NOT LIKE aid::text||'/'||iid::text||'/%'
   OR p_input->>'contentType' NOT IN ('application/pdf','image/png','image/jpeg')
 ) THEN RAISE EXCEPTION 'Invalid invoice attachment.'; END IF;
 -- Same lock order as the existing claim and payout workflow. No partial invoices.
 FOR item IN SELECT value FROM jsonb_array_elements(p_input->'allocations') ORDER BY value->>'saleId' LOOP
  sid:=(item->>'saleId')::uuid; amount:=(item->>'amountCents')::integer;
  IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Positive allocation required.'; END IF;
  PERFORM 1 FROM contract_product_sales WHERE id=sid FOR UPDATE;
  PERFORM 1 FROM contract_commission_assignments WHERE sale_id=sid FOR UPDATE;
  SELECT * INTO balance FROM contract_commission_balances WHERE sale_id=sid AND agent_id=aid;
  IF NOT FOUND OR amount>balance.earned_cents-balance.claimed_cents THEN
   RAISE EXCEPTION 'Allocation exceeds commission available to invoice. Refresh balances.';
  END IF;
 END LOOP;
 INSERT INTO contract_commission_received_invoices(id,agent_id,invoice_reference,invoice_date,amount_cents,storage_path,content_type,recorded_by,request_payload)
 VALUES(iid,aid,ref,(p_input->>'invoiceDate')::date,total,p_input->>'storagePath',p_input->>'contentType',p_actor_id,p_input);
 FOR item IN SELECT value FROM jsonb_array_elements(p_input->'allocations') LOOP
  cid:=gen_random_uuid();
  INSERT INTO contract_commission_claims(id,sale_id,agent_id,amount_cents,invoice_reference)
  VALUES(cid,(item->>'saleId')::uuid,aid,(item->>'amountCents')::integer,ref);
  INSERT INTO contract_commission_invoice_allocations VALUES(iid,cid);
 END LOOP;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
 VALUES('commission',iid::text,'commission.invoice_received',jsonb_build_object('actorId',p_actor_id,'agentId',aid,'amountCents',total,'allocations',p_input->'allocations'));
 RETURN iid;
END $$;
REVOKE ALL ON FUNCTION record_received_commission_invoice(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION record_received_commission_invoice(uuid,jsonb) TO service_role;
-- Keep existing agent submissions compatible while preventing a second claim for an owner-recorded invoice.
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
  IF p_action='claim' THEN PERFORM 1 FROM admin_staff_accounts WHERE id=aid FOR UPDATE; END IF;
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
   IF EXISTS(SELECT 1 FROM contract_commission_received_invoices WHERE agent_id=aid AND lower(trim(invoice_reference))=lower(trim(p_input->>'reference'))) THEN RAISE EXCEPTION 'This invoice was already recorded by the owner.'; END IF;
   IF amount>balance.earned_cents-balance.claimed_cents THEN RAISE EXCEPTION 'Amount exceeds commission available to invoice.'; END IF;
   INSERT INTO contract_commission_claims VALUES(rid,sid,aid,amount,p_input->>'reference',now());
  ELSE
   IF amount>least(balance.earned_cents,balance.claimed_cents)-balance.paid_cents THEN RAISE EXCEPTION 'Amount exceeds invoiced, unpaid commission.'; END IF;
   INSERT INTO contract_commission_payouts VALUES(rid,sid,aid,amount,(p_input->>'paidOn')::date,p_input->>'reference',p_actor_id,now());
  END IF;
 ELSE RAISE EXCEPTION 'Invalid commission action.'; END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('commission',coalesce(sid::text,'defaults'),'commission.'||p_action,jsonb_build_object('actorId',p_actor_id,'input',p_input));
END $$;

COMMIT;
