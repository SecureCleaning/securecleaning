-- Future sales only. No backfill or UPDATE of existing business records.
BEGIN;
CREATE TABLE public.commission_source_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 legacy_provider_name text,
 agent_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
 agent_bps integer NOT NULL CHECK (agent_bps BETWEEN 0 AND 10000),
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE UNIQUE INDEX commission_source_rule_name ON public.commission_source_rules(lower(btrim(name)));
ALTER TABLE public.commission_source_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_source_rules FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.commission_source_rules TO service_role;
-- Verified Team Access identity; never guess from display names at runtime.
INSERT INTO public.commission_source_rules(id,name,legacy_provider_name,agent_id,agent_bps)
SELECT 'c08e0000-0000-4000-8000-000000000001','Cove Commercial Cleaning','Cove Commercial Cleaning',id,6000
FROM public.admin_staff_accounts WHERE id='72bddeab-8e0e-4bb2-bee4-c48cafbeede6' AND active AND role::text='agent';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.commission_source_rules) THEN
  RAISE EXCEPTION 'Verified Cove agent is unavailable. Review Team Access before migration.';
 END IF;
END $$;

CREATE FUNCTION public.save_commission_source_rule(p_actor_id uuid,p_id uuid,p_name text,p_agent_id uuid,
 p_agent_bps integer,p_active boolean,p_expected_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE prior public.commission_source_rules%ROWTYPE; saved public.commission_source_rules%ROWTYPE;
BEGIN
 PERFORM 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM admin_staff_accounts WHERE id=p_agent_id AND active AND role::text='agent' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active agent' USING ERRCODE='23514'; END IF;
 IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
   OR p_agent_bps IS NULL OR p_agent_bps NOT BETWEEN 0 AND 10000 OR p_active IS NULL THEN
   RAISE EXCEPTION 'Invalid rule' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commission-source:'||p_id::text,0));
 SELECT * INTO prior FROM commission_source_rules WHERE id=p_id FOR UPDATE;
 IF coalesce(prior.revision,0) IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001';
 END IF;
 IF prior.id IS NULL THEN
  INSERT INTO commission_source_rules(id,name,agent_id,agent_bps,active)
  VALUES(p_id,btrim(p_name),p_agent_id,p_agent_bps,p_active) RETURNING * INTO saved;
 ELSE
  UPDATE commission_source_rules SET name=btrim(p_name),agent_id=p_agent_id,agent_bps=p_agent_bps,
   active=p_active,revision=revision+1 WHERE id=p_id RETURNING * INTO saved;
 END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
 VALUES('commission_source',p_id::text,'commission.source_rule_saved',jsonb_build_object(
  'actorId',p_actor_id,'before',to_jsonb(prior),'after',to_jsonb(saved),'appliesTo','future sales only'));
END $$;
REVOKE ALL ON FUNCTION public.save_commission_source_rule(uuid,uuid,text,uuid,integer,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_commission_source_rule(uuid,uuid,text,uuid,integer,boolean,integer) TO service_role;

ALTER TABLE public.contract_product_sales ADD COLUMN commission_source_snapshot jsonb;
COMMENT ON COLUMN public.contract_product_sales.commission_source_snapshot IS 'Private source rule captured only on new sales. Null for pre-existing/standard sales. Settings changes never recalculate this snapshot.';
CREATE FUNCTION public.capture_sale_commission_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE intake record; rule public.commission_source_rules%ROWTYPE; agent_name text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.commission_source_snapshot IS DISTINCT FROM OLD.commission_source_snapshot THEN
   RAISE EXCEPTION 'Sale commission source is locked';
  END IF;
  RETURN NEW;
 END IF;
 -- Ignore caller-supplied snapshots. The original intake determines the source.
 NEW.commission_source_snapshot := NULL;
 SELECT l.source,l.source_provider INTO intake FROM crm_opportunity_intakes oi
 JOIN leads l ON l.id=oi.lead_id WHERE oi.opportunity_id=NEW.opportunity_id
 ORDER BY oi.linked_at,oi.lead_id LIMIT 1;
 IF intake.source LIKE 'referral:%' THEN
  SELECT * INTO rule FROM commission_source_rules WHERE 'referral:'||id::text=intake.source FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown commission source; review enquiry source'; END IF;
 ELSIF intake.source='manual' THEN
  -- Read-only compatibility for the already-labelled Cove enquiry; never edit its intake.
  SELECT * INTO rule FROM commission_source_rules
  WHERE lower(btrim(legacy_provider_name))=lower(btrim(intake.source_provider)) FOR SHARE;
 END IF;
 IF rule.id IS NOT NULL THEN
  SELECT display_name INTO agent_name FROM admin_staff_accounts WHERE id=rule.agent_id;
  NEW.commission_source_snapshot := jsonb_build_object('ruleId',rule.id,'name',rule.name,
   'agentId',rule.agent_id,'agentName',agent_name,'agentBps',rule.agent_bps,'revision',rule.revision);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_capture_sale_commission_source BEFORE INSERT OR UPDATE OF commission_source_snapshot
 ON public.contract_product_sales FOR EACH ROW EXECUTE FUNCTION public.capture_sale_commission_source();
REVOKE ALL ON FUNCTION public.capture_sale_commission_source() FROM PUBLIC,anon,authenticated;

-- Protect every insertion path, including the legacy manual-assignment RPC.
CREATE FUNCTION public.guard_source_commission_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT commission_source_snapshot INTO snapshot FROM contract_product_sales WHERE id=NEW.sale_id;
 IF snapshot IS NOT NULL AND (NEW.win_agent_id IS DISTINCT FROM (snapshot->>'agentId')::uuid
  OR NEW.sale_agent_id IS DISTINCT FROM (snapshot->>'agentId')::uuid
  OR NEW.win_bps IS DISTINCT FROM (snapshot->>'agentBps')::integer OR NEW.sale_bps IS DISTINCT FROM 0) THEN
  RAISE EXCEPTION 'Use the saved enquiry-source commission rule for this sale' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_source_commission_assignment BEFORE INSERT ON public.contract_commission_assignments
 FOR EACH ROW EXECUTE FUNCTION public.guard_source_commission_assignment();
REVOKE ALL ON FUNCTION public.guard_source_commission_assignment() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_crm_record_with_premises(p_operation text, p_values jsonb,
 p_premises_type text, p_premises_other text, p_import_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result_id uuid; site_id_value uuid; current_type text; actor_id_value uuid; source_rule public.commission_source_rules%ROWTYPE;
BEGIN
 actor_id_value := (p_values->>'p_actor_id')::uuid;
 IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id=actor_id_value AND active
   AND role=p_values->>'p_actor_role' AND role IN ('owner','manager','agent')) THEN
   RAISE EXCEPTION 'CRM access denied' USING ERRCODE='42501';
 END IF;
 IF p_import_key IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(actor_id_value::text || p_import_key,0));
   SELECT opportunity_id INTO result_id FROM crm_lead_import_rows
     WHERE actor_id=actor_id_value AND import_key=p_import_key;
   IF result_id IS NOT NULL THEN
     IF p_values->>'p_actor_role'='agent' AND NOT EXISTS (SELECT 1 FROM crm_opportunities WHERE id=result_id AND assigned_staff_id=actor_id_value) THEN
       RAISE EXCEPTION 'CRM access denied' USING ERRCODE='42501';
     END IF;
     RETURN result_id;
   END IF;
 END IF;
 IF p_operation='update' THEN
   result_id := update_client_crm_profile(
     (p_values->>'p_opportunity_id')::uuid,
     (p_values->>'p_expected_opportunity_updated_at')::timestamptz,
     (p_values->>'p_expected_organisation_updated_at')::timestamptz,
     (p_values->>'p_expected_contact_updated_at')::timestamptz,
     (p_values->>'p_expected_site_updated_at')::timestamptz,
     p_values->>'p_business_name',p_values->>'p_first_name',p_values->>'p_last_name',
     p_values->>'p_position_title',p_values->>'p_email',p_values->>'p_phone',
     p_values->>'p_site_name',p_values->>'p_address',p_values->>'p_suburb',p_values->>'p_postcode',
     actor_id_value,p_values->>'p_actor_role');
 ELSIF p_operation='create' THEN
   IF p_values->>'p_source' LIKE 'referral:%' THEN
     SELECT * INTO source_rule FROM commission_source_rules
       WHERE 'referral:'||id::text=p_values->>'p_source' AND active FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Select an active enquiry source' USING ERRCODE='23514'; END IF;
     PERFORM 1 FROM admin_staff_accounts WHERE id=source_rule.agent_id AND active AND role::text='agent' FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Enquiry source agent is unavailable' USING ERRCODE='23514'; END IF;
     IF p_values->>'p_actor_role'='agent' AND actor_id_value<>source_rule.agent_id THEN
       RAISE EXCEPTION 'Source belongs to another agent' USING ERRCODE='42501';
     END IF;
     p_values := p_values || jsonb_build_object('p_source_provider',source_rule.name,
       'p_assigned_staff_id',source_rule.agent_id,'p_assignment_method','manual_override');
   END IF;
   result_id := create_client_crm_opportunity(
     p_values->>'p_business_name',p_values->>'p_contact_name',p_values->>'p_email',p_values->>'p_phone',
     p_values->>'p_address',p_values->>'p_suburb',p_values->>'p_postcode',(p_values->>'p_city')::city_type,
     p_values->>'p_source',p_values->>'p_source_provider',p_values->>'p_source_reference',
     p_values->>'p_source_explanation',p_values->>'p_contact_basis',
     (p_values->>'p_assigned_staff_id')::uuid,p_values->>'p_assignment_method',p_values->>'p_notes',
     actor_id_value,p_values->>'p_actor_role');
 ELSE RAISE EXCEPTION 'Invalid operation'; END IF;
 SELECT site_id INTO site_id_value FROM crm_opportunities WHERE id=result_id;
 -- NULL means an older caller did not submit this field: leave it unchanged.
 IF p_premises_type IS NOT NULL THEN
   IF site_id_value IS NULL AND p_premises_type <> '' THEN
     INSERT INTO sites(client_id,organisation_id,site_name,address,city,is_active)
       SELECT o.primary_contact_id,o.organisation_id,nullif(p_values->>'p_business_name',''),'',c.city,true
       FROM crm_opportunities o JOIN clients c ON c.id=o.primary_contact_id WHERE o.id=result_id
       RETURNING id INTO site_id_value;
     result_id := crm_promote_provisional_opportunity(result_id,site_id_value);
   END IF;
   SELECT premises_type INTO current_type FROM sites WHERE id=site_id_value FOR UPDATE;
   IF p_premises_type <> '' AND NOT EXISTS (SELECT 1 FROM crm_premises_types
     WHERE code=p_premises_type AND (active OR code=current_type)) THEN
     RAISE EXCEPTION 'Select an available premises type' USING ERRCODE='23514';
   END IF;
   IF p_premises_type='other' AND length(btrim(coalesce(p_premises_other,''))) NOT BETWEEN 1 AND 100 THEN
     RAISE EXCEPTION 'Describe the other premises type' USING ERRCODE='23514';
   END IF;
   UPDATE sites SET premises_type=nullif(p_premises_type,''),
     premises_type_other=CASE WHEN p_premises_type='other' THEN btrim(p_premises_other) ELSE '' END,
     updated_at=now() WHERE id=site_id_value;
 END IF;
 IF p_operation='create' THEN
   UPDATE crm_opportunities SET
     cleaning_frequency=nullif(p_values->>'p_cleaning_frequency',''),
     cleaning_time_preference=coalesce(nullif(p_values->>'p_cleaning_time_preference',''),'after_hours')
   WHERE id=result_id;
 END IF;
 IF p_import_key IS NOT NULL THEN
   INSERT INTO crm_lead_import_rows(actor_id,import_key,opportunity_id) VALUES(actor_id_value,p_import_key,result_id);
 END IF;
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.save_crm_record_with_premises(text,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_crm_record_with_premises(text,jsonb,text,text,text) TO service_role;


CREATE OR REPLACE VIEW contract_commission_attribution_status AS
SELECT s.id sale_id, s.sale_code, s.status,
  a.sale_id IS NOT NULL has_assignment,
  CASE WHEN s.commission_source_snapshot IS NOT NULL THEN referral_agent.id WHEN cardinality(w.ids)=1 THEN w.ids[1] END win_agent_id,
  CASE WHEN s.commission_source_snapshot IS NOT NULL THEN referral_agent.id ELSE seller.id END sale_agent_id,
  CASE WHEN s.commission_source_snapshot IS NOT NULL THEN 'Enquiry-source commission needs review. The saved source recipient must be an active agent; retry the saved rule after resolving Team Access.'
    WHEN cardinality(w.ids) IS DISTINCT FROM 1 AND seller.id IS NULL
    THEN 'The quote sender and sale creator could not both be matched to active agents. Confirm both agents.'
    WHEN cardinality(w.ids) IS DISTINCT FROM 1
    THEN 'The final quote has no uniquely identifiable active agent sender. Confirm the site-winning agent.'
    WHEN seller.id IS NULL
    THEN 'The sale creator is not an active agent. Confirm the selling agent.'
    ELSE 'Agent details are available but commission has not been assigned. Review and confirm the agents and rates.'
  END review_reason, s.commission_source_snapshot source_snapshot
FROM contract_product_sales s
LEFT JOIN contract_commission_assignments a ON a.sale_id=s.id
LEFT JOIN admin_staff_accounts referral_agent ON referral_agent.id=(s.commission_source_snapshot->>'agentId')::uuid AND referral_agent.active AND referral_agent.role::text='agent'
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
  IF attribution.source_snapshot IS NOT NULL THEN
    PERFORM 1 FROM admin_staff_accounts WHERE id=attribution.win_agent_id AND active AND role::text='agent' FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  SELECT * INTO defaults FROM contract_commission_settings WHERE id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO contract_commission_assignments(sale_id,win_agent_id,sale_agent_id,win_bps,sale_bps,created_by,created_at)
  VALUES(p_sale_id,attribution.win_agent_id,attribution.sale_agent_id,CASE WHEN attribution.source_snapshot IS NULL THEN defaults.win_bps ELSE (attribution.source_snapshot->>'agentBps')::integer END,
    CASE WHEN attribution.source_snapshot IS NULL THEN defaults.sale_bps ELSE 0 END,attribution.sale_agent_id,now())
  ON CONFLICT(sale_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count=1 THEN
    INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('commission',p_sale_id::text,'commission.auto_assigned',jsonb_build_object(
      'winAgentId',attribution.win_agent_id,'saleAgentId',attribution.sale_agent_id,
      'winBps',CASE WHEN attribution.source_snapshot IS NULL THEN defaults.win_bps ELSE (attribution.source_snapshot->>'agentBps')::integer END,
      'saleBps',CASE WHEN attribution.source_snapshot IS NULL THEN defaults.sale_bps ELSE 0 END,'sourceRule',attribution.source_snapshot));
  END IF;
END $$;
REVOKE ALL ON FUNCTION try_assign_contract_sale_commission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION try_assign_contract_sale_commission(uuid) TO service_role;

CREATE FUNCTION public.retry_source_commission(p_actor_id uuid,p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role::text='owner') THEN
  RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM contract_product_sales WHERE id=p_sale_id AND commission_source_snapshot IS NOT NULL AND status<>'cancelled' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source commission sale not found'; END IF;
 PERFORM try_assign_contract_sale_commission(p_sale_id);
 IF NOT EXISTS (SELECT 1 FROM contract_commission_assignments WHERE sale_id=p_sale_id) THEN
  RAISE EXCEPTION 'Saved source agent is unavailable. Review Team Access.' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.retry_source_commission(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_source_commission(uuid,uuid) TO service_role;
COMMIT;
