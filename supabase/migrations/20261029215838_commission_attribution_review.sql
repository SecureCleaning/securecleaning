-- Requires contract_sale_automatic_commission_assignment_migration.sql.
-- Only the user-requested St Andrews repair is backfilled; other historical sales remain in review.
BEGIN;
CREATE OR REPLACE VIEW contract_commission_attribution_status AS
SELECT s.id sale_id, s.sale_code, s.status,
  a.sale_id IS NOT NULL has_assignment,
  CASE WHEN cardinality(w.ids)=1 THEN w.ids[1] END win_agent_id,
  seller.id sale_agent_id,
  CASE WHEN cardinality(w.ids) IS DISTINCT FROM 1 AND seller.id IS NULL
    THEN 'The quote sender and sale creator could not both be matched to active agents. Confirm both agents.'
    WHEN cardinality(w.ids) IS DISTINCT FROM 1
    THEN 'The final quote has no uniquely identifiable active agent sender. Confirm the site-winning agent.'
    WHEN seller.id IS NULL
    THEN 'The sale creator is not an active agent. Confirm the selling agent.'
    ELSE 'Agent details are available but commission has not been assigned. Review and confirm the agents and rates.'
  END review_reason
FROM contract_product_sales s
LEFT JOIN contract_commission_assignments a ON a.sale_id=s.id
LEFT JOIN admin_staff_accounts seller ON seller.id=s.created_by_staff_id AND seller.active AND seller.role::text='agent'
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT staff.id ORDER BY staff.id) ids
  FROM quotes q
  -- Revision clears current-version send fields. Retain attribution from the
  -- original successfully finalised send, never a later resend or failed attempt.
  LEFT JOIN LATERAL (
    SELECT sent.actor FROM (
      SELECT attempt.actor,attempt.finalized_at sent_at,attempt.id::text tie_breaker
      FROM quote_send_attempts attempt
      WHERE attempt.quote_ref=q.quote_ref AND attempt.status='finalized'
        AND attempt.document_variant='final' AND attempt.finalized_at IS NOT NULL
      UNION ALL
      SELECT version.sent_by,version.sent_at,version.document_version::text
      FROM quote_final_document_versions version
      WHERE version.quote_ref=q.quote_ref AND version.sent_variant='final'
        AND version.sent_at IS NOT NULL AND version.sent_by IS NOT NULL
      UNION ALL
      SELECT q.final_quote_sent_by,q.final_quote_sent_at,'current'
      WHERE q.final_quote_sent_at IS NOT NULL AND q.final_quote_sent_by IS NOT NULL
    ) sent
    ORDER BY sent.sent_at ASC FETCH FIRST 1 ROW WITH TIES
  ) historical ON true
  CROSS JOIN LATERAL (
    SELECT historical.actor
  ) sender
  JOIN admin_staff_accounts staff ON (
    (sender.actor->>'kind'='staff_account' AND staff.id::text=sender.actor->>'id') OR
    (sender.actor->>'kind'='agent_session' AND staff.availability_assignee_id=sender.actor->>'id')
  )
  WHERE q.id=s.source_quote_id AND staff.active AND staff.role::text='agent'
) w ON true;
REVOKE ALL ON contract_commission_attribution_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON contract_commission_attribution_status TO service_role;

CREATE OR REPLACE FUNCTION try_assign_contract_sale_commission(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE attribution record; defaults contract_commission_settings%ROWTYPE; inserted_count integer;
BEGIN
  -- Same sale lock as the owner assignment/revision workflow. Never rewrite an assignment.
  PERFORM 1 FROM contract_product_sales WHERE id=p_sale_id FOR UPDATE;
  SELECT * INTO attribution FROM contract_commission_attribution_status WHERE sale_id=p_sale_id;
  IF NOT FOUND OR attribution.status='cancelled' OR attribution.has_assignment
    OR attribution.win_agent_id IS NULL OR attribution.sale_agent_id IS NULL THEN RETURN; END IF;
  SELECT * INTO defaults FROM contract_commission_settings WHERE id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO contract_commission_assignments(sale_id,win_agent_id,sale_agent_id,win_bps,sale_bps,created_by,created_at)
  VALUES(p_sale_id,attribution.win_agent_id,attribution.sale_agent_id,defaults.win_bps,defaults.sale_bps,attribution.sale_agent_id,now())
  ON CONFLICT(sale_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count=1 THEN
    INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('commission',p_sale_id::text,'commission.auto_assigned',jsonb_build_object(
      'winAgentId',attribution.win_agent_id,'saleAgentId',attribution.sale_agent_id,
      'winBps',defaults.win_bps,'saleBps',defaults.sale_bps));
  END IF;
END $$;
REVOKE ALL ON FUNCTION try_assign_contract_sale_commission(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION auto_assign_contract_sale_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM try_assign_contract_sale_commission(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_auto_assign_contract_sale_commission ON contract_product_sales;
CREATE TRIGGER trg_auto_assign_contract_sale_commission
AFTER INSERT OR UPDATE OF source_quote_id,created_by_staff_id,status ON contract_product_sales
FOR EACH ROW EXECUTE FUNCTION auto_assign_contract_sale_commission();

CREATE OR REPLACE FUNCTION retry_quote_sale_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid;
BEGIN
  IF NEW.final_quote_sent_at IS NOT DISTINCT FROM OLD.final_quote_sent_at
    AND NEW.final_quote_sent_by IS NOT DISTINCT FROM OLD.final_quote_sent_by THEN RETURN NEW; END IF;
  FOR sid IN SELECT id FROM contract_product_sales WHERE source_quote_id=NEW.id AND status<>'cancelled' ORDER BY id LOOP
    PERFORM try_assign_contract_sale_commission(sid);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_retry_quote_sale_commissions
AFTER UPDATE OF final_quote_sent_at,final_quote_sent_by ON quotes
FOR EACH ROW EXECUTE FUNCTION retry_quote_sale_commissions();
REVOKE ALL ON FUNCTION auto_assign_contract_sale_commission() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION retry_quote_sale_commissions() FROM PUBLIC,anon,authenticated;
-- User requested repair of PS-2026-01007. The helper requires reliable original
-- sender and creator evidence and preserves any assignment already made by admin.
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM contract_product_sales WHERE sale_code='PS-2026-01007';
  IF sid IS NOT NULL THEN PERFORM try_assign_contract_sale_commission(sid); END IF;
END $$;
COMMIT;
