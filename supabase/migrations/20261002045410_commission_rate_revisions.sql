-- Apply after contract_sale_automatic_commission_assignment_migration.sql.
-- No backfill. Deploy this migration before the application changes.
BEGIN;
CREATE TABLE IF NOT EXISTS contract_commission_revisions (
 id uuid PRIMARY KEY,
 sale_id uuid NOT NULL REFERENCES contract_commission_assignments(sale_id),
 actor_id uuid NOT NULL REFERENCES admin_staff_accounts(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 preview jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_revisions_sale ON contract_commission_revisions(sale_id,created_at);
ALTER TABLE contract_commission_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contract_commission_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON contract_commission_revisions TO service_role;
DROP TRIGGER IF EXISTS protect_commission_revision ON contract_commission_revisions;
CREATE TRIGGER protect_commission_revision BEFORE UPDATE OR DELETE ON contract_commission_revisions
FOR EACH ROW EXECUTE FUNCTION protect_contract_commission_entry();

-- Pure projection of the existing balance formula; never changes receipts or claims.
CREATE OR REPLACE FUNCTION project_contract_commission_rates(p_sale_id uuid,p_win_bps integer,p_sale_bps integer)
RETURNS SETOF contract_commission_balances LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
WITH receipts AS (
 SELECT i.sale_id, sum(i.total_inc_gst_cents)::bigint gross, sum(i.total_inc_gst_cents-i.gst_component_cents)::bigint net,
 sum(coalesce(p.paid,0))::bigint paid
 FROM contract_sale_invoices i LEFT JOIN LATERAL (SELECT sum(amount_cents) paid FROM contract_sale_payment_allocations WHERE invoice_id=i.id) p ON true
 WHERE i.sale_id=p_sale_id AND i.status<>'void' GROUP BY i.sale_id
), roles AS (
 SELECT sale_id,win_agent_id agent_id,'win' component,p_win_bps win_rate,p_win_bps+p_sale_bps total_rate FROM contract_commission_assignments WHERE sale_id=p_sale_id
 UNION ALL SELECT sale_id,sale_agent_id,'sale',p_win_bps,p_win_bps+p_sale_bps FROM contract_commission_assignments WHERE sale_id=p_sale_id
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
$$;
REVOKE ALL ON FUNCTION project_contract_commission_rates(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION project_contract_commission_rates(uuid,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION preview_contract_commission_revision(p_actor_id uuid,p_sale_id uuid,p_win_bps integer,p_sale_bps integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE prior record; before_rows jsonb; after_rows jsonb; revision_count bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner') THEN
  RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501';
 END IF;
 IF p_win_bps IS NULL OR p_sale_bps IS NULL OR p_win_bps<0 OR p_sale_bps<0 OR p_win_bps>10000 OR p_sale_bps>10000 OR p_win_bps+p_sale_bps>10000 THEN
  RAISE EXCEPTION 'Invalid commission rates.' USING ERRCODE='22023';
 END IF;
 -- Same lock order as claims, payouts, and assignment corrections.
 PERFORM 1 FROM contract_product_sales WHERE id=p_sale_id AND status<>'cancelled' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active sale not found.'; END IF;
 SELECT * INTO prior FROM contract_commission_assignments WHERE sale_id=p_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Commission assignment not found.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY agent_id),'[]') INTO before_rows FROM contract_commission_balances b WHERE sale_id=p_sale_id;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY agent_id),'[]') INTO after_rows FROM project_contract_commission_rates(p_sale_id,p_win_bps,p_sale_bps) b;
 SELECT count(*) INTO revision_count FROM contract_commission_revisions WHERE sale_id=p_sale_id;
 RETURN jsonb_build_object('saleId',p_sale_id,'previousWinBps',prior.win_bps,'previousSaleBps',prior.sale_bps,
 'winBps',p_win_bps,'saleBps',p_sale_bps,'winAgentId',prior.win_agent_id,'saleAgentId',prior.sale_agent_id,
 'revisionCount',revision_count,'before',before_rows,'after',after_rows);
END $$;
REVOKE ALL ON FUNCTION preview_contract_commission_revision(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION preview_contract_commission_revision(uuid,uuid,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION revise_contract_commission(p_actor_id uuid,p_sale_id uuid,p_win_bps integer,p_sale_bps integer,p_reason text,p_request_id uuid,p_expected jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_preview jsonb; replay contract_commission_revisions%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner') THEN
  RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'A revision reason and request ID are required.';
 END IF;
 PERFORM 1 FROM contract_product_sales WHERE id=p_sale_id FOR UPDATE;
 SELECT * INTO replay FROM contract_commission_revisions WHERE id=p_request_id;
 IF FOUND THEN
  IF replay.sale_id=p_sale_id AND replay.actor_id=p_actor_id AND replay.reason=trim(p_reason) AND replay.preview=p_expected
   AND (replay.preview->>'winBps')::integer=p_win_bps AND (replay.preview->>'saleBps')::integer=p_sale_bps THEN RETURN; END IF;
  RAISE EXCEPTION 'Request ID was used for different details.';
 END IF;
 current_preview:=preview_contract_commission_revision(p_actor_id,p_sale_id,p_win_bps,p_sale_bps);
 IF p_expected IS DISTINCT FROM current_preview THEN RAISE EXCEPTION 'Commission changed. Preview again before confirming.' USING ERRCODE='40001'; END IF;
 IF (current_preview->>'previousWinBps')::integer=p_win_bps AND (current_preview->>'previousSaleBps')::integer=p_sale_bps THEN
  RAISE EXCEPTION 'Enter different commission rates.';
 END IF;
 PERFORM set_config('app.commission_assignment_correction','allowed',true);
 UPDATE contract_commission_assignments SET win_bps=p_win_bps,sale_bps=p_sale_bps WHERE sale_id=p_sale_id;
 PERFORM set_config('app.commission_assignment_correction','',true);
 INSERT INTO contract_commission_revisions(id,sale_id,actor_id,reason,preview) VALUES(p_request_id,p_sale_id,p_actor_id,trim(p_reason),current_preview);
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('commission',p_sale_id::text,'commission.rates_revised',
 jsonb_build_object('actorId',p_actor_id,'revisionId',p_request_id,'reason',trim(p_reason),'preview',current_preview));
END $$;
REVOKE ALL ON FUNCTION revise_contract_commission(uuid,uuid,integer,integer,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION revise_contract_commission(uuid,uuid,integer,integer,text,uuid,jsonb) TO service_role;
COMMIT;
