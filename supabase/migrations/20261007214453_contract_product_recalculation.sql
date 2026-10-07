-- Apply after contract_product_timing_refresh_migration.sql.
BEGIN;
ALTER TABLE public.contract_products ADD COLUMN IF NOT EXISTS annual_value_method TEXT NOT NULL DEFAULT 'calculated'
 CHECK (annual_value_method IN ('calculated','manual'));

CREATE OR REPLACE FUNCTION public.audit_contract_product_pricing() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF ROW(NEW.client_price_per_visit_ex_gst_cents,NEW.annual_visits,NEW.annual_contract_value_ex_gst_cents,NEW.annual_value_method,NEW.purchase_price_ex_gst_cents,NEW.pricing_method)
 IS DISTINCT FROM ROW(OLD.client_price_per_visit_ex_gst_cents,OLD.annual_visits,OLD.annual_contract_value_ex_gst_cents,OLD.annual_value_method,OLD.purchase_price_ex_gst_cents,OLD.pricing_method) THEN
  IF OLD.status NOT IN ('draft','withdrawn') OR NEW.status NOT IN ('draft','withdrawn') THEN
   RAISE EXCEPTION 'Withdraw product before editing pricing' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details) VALUES
   ('contract_product',NEW.id::TEXT,'contract_product.pricing_changed',jsonb_build_object(
    'previousAnnualValue',OLD.annual_contract_value_ex_gst_cents,'annualValue',NEW.annual_contract_value_ex_gst_cents,
    'annualValueMethod',NEW.annual_value_method,'previousRate',OLD.client_price_per_visit_ex_gst_cents,
    'rate',NEW.client_price_per_visit_ex_gst_cents,'previousPurchasePrice',OLD.purchase_price_ex_gst_cents,'purchasePrice',NEW.purchase_price_ex_gst_cents));
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_contract_product_pricing_audit ON public.contract_products;
CREATE TRIGGER trg_contract_product_pricing_audit BEFORE UPDATE ON public.contract_products
 FOR EACH ROW EXECUTE FUNCTION public.audit_contract_product_pricing();
REVOKE ALL ON FUNCTION public.audit_contract_product_pricing() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_contract_product_from_quote(
 p_product_id UUID, p_expected_updated_at TIMESTAMPTZ,
 p_source_quote_document_version INTEGER, p_cleaner_scope_snapshot JSONB,
 p_actor_id UUID, p_actor_role TEXT, p_actor_state TEXT,
 p_expected_quote_updated_at TIMESTAMPTZ, p_client_rate_cents INTEGER
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
 p public.contract_products%ROWTYPE;
 q public.quotes%ROWTYPE;
 visits INTEGER;
 annual BIGINT;
 purchase BIGINT;
 refreshed TIMESTAMPTZ;
BEGIN
 -- Existing scope refresh validates the active actor, regional assignment, status and snapshot.
 SELECT * INTO p FROM public.contract_products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO q FROM public.quotes WHERE id=p.source_quote_id FOR SHARE;
 IF NOT FOUND OR p_expected_quote_updated_at IS NULL OR q.updated_at IS DISTINCT FROM p_expected_quote_updated_at THEN
  RAISE EXCEPTION 'Winning quote changed or unavailable' USING ERRCODE='40001';
 END IF;
 IF p_client_rate_cents IS NULL OR p_client_rate_cents <= 0 THEN RAISE EXCEPTION 'Invalid quote rate' USING ERRCODE='23514'; END IF;
 IF q.final_quote_document IS NOT NULL AND
  ROUND((q.final_quote_document #>> '{displayPrice,low}')::NUMERIC * 100) IS DISTINCT FROM p_client_rate_cents::NUMERIC THEN
  RAISE EXCEPTION 'Rate does not match final quote' USING ERRCODE='23514';
 END IF;
 visits := CASE p_cleaner_scope_snapshot->>'frequency' WHEN 'daily' THEN 260 WHEN '3x_week' THEN 156
  WHEN '2x_week' THEN 104 WHEN 'weekly' THEN 52 WHEN 'fortnightly' THEN 26 WHEN 'monthly' THEN 12 WHEN 'once_off' THEN 1 ELSE 0 END;
 annual := p_client_rate_cents::BIGINT * visits;
 purchase := CASE WHEN p.pricing_method='manual' THEN p.purchase_price_ex_gst_cents ELSE ROUND(annual*0.5) END;
 IF visits=0 OR annual <= 0 OR annual>1000000000 OR ROUND(purchase*1.1)<=50000 THEN
  RAISE EXCEPTION 'Invalid annual value or purchase price' USING ERRCODE='23514';
 END IF;
 refreshed := public.refresh_contract_product_cleaner_scope(p_product_id,p_expected_updated_at,
  p_source_quote_document_version,p_cleaner_scope_snapshot,p_actor_id,p_actor_role,p_actor_state);
 UPDATE public.contract_products SET client_price_per_visit_ex_gst_cents=p_client_rate_cents,
  frequency=p_cleaner_scope_snapshot->>'frequency',annual_visits=visits,
  annual_value_method='calculated',annual_contract_value_ex_gst_cents=annual,
  purchase_price_ex_gst_cents=purchase WHERE id=p_product_id RETURNING updated_at INTO refreshed;
 INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details) VALUES
  ('contract_product',p_product_id::TEXT,'contract_product.pricing_recalculated',
   jsonb_build_object('actorId',p_actor_id,'quoteId',q.id,'sourceQuoteUpdatedAt',q.updated_at));
 RETURN refreshed;
END; $$;
REVOKE ALL ON FUNCTION public.recalculate_contract_product_from_quote(UUID,TIMESTAMPTZ,INTEGER,JSONB,UUID,TEXT,TEXT,TIMESTAMPTZ,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_contract_product_from_quote(UUID,TIMESTAMPTZ,INTEGER,JSONB,UUID,TEXT,TEXT,TIMESTAMPTZ,INTEGER) TO service_role;
COMMIT;
