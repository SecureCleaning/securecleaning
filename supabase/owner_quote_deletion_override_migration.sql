-- Apply after admin_quote_deletion_migration.sql and contract_sale_commissions_plans_migration.sql.
-- No existing records are deleted by this migration. Uploaded storage objects are never touched.
BEGIN;
ALTER TABLE public.contract_products ALTER COLUMN source_quote_id DROP NOT NULL;
ALTER TABLE public.contract_product_sales ALTER COLUMN source_quote_id DROP NOT NULL;
ALTER TABLE public.contract_products ADD COLUMN IF NOT EXISTS deleted_source_quote_ref text;
ALTER TABLE public.contract_product_sales ADD COLUMN IF NOT EXISTS deleted_source_quote_ref text;

-- Retained products can still start a sale using their saved scope and reference.
CREATE OR REPLACE FUNCTION public.retain_deleted_sale_quote_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.source_quote_id IS NULL THEN
    SELECT deleted_source_quote_ref INTO NEW.deleted_source_quote_ref FROM contract_products WHERE id=NEW.product_id;
    IF NEW.deleted_source_quote_ref IS NULL THEN RAISE EXCEPTION 'A source quote or retained quote reference is required.'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_retain_deleted_sale_quote ON contract_product_sales;
CREATE TRIGGER trg_retain_deleted_sale_quote BEFORE INSERT ON contract_product_sales
  FOR EACH ROW EXECUTE FUNCTION retain_deleted_sale_quote_reference();
REVOKE ALL ON FUNCTION public.retain_deleted_sale_quote_reference() FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.quote_deletion_archive (
  quote_ref text PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  actor jsonb NOT NULL,
  reason text NOT NULL,
  linked_records text NOT NULL CHECK (linked_records IN ('keep', 'delete')),
  snapshot jsonb NOT NULL
);
ALTER TABLE public.quote_deletion_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_deletion_archive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.quote_deletion_archive TO service_role;

CREATE OR REPLACE FUNCTION protect_contract_product_sale_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.sale_code IS DISTINCT FROM NEW.sale_code
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id
    OR OLD.opportunity_id IS DISTINCT FROM NEW.opportunity_id
    OR ((OLD.source_quote_id IS DISTINCT FROM NEW.source_quote_id OR OLD.deleted_source_quote_ref IS DISTINCT FROM NEW.deleted_source_quote_ref) AND NOT (
      NEW.source_quote_id IS NULL AND
      COALESCE(current_setting('app.deleting_quote_id', true) = OLD.source_quote_id::text, false)
      AND NEW.deleted_source_quote_ref IS NOT NULL
    ))
    OR OLD.site_id IS DISTINCT FROM NEW.site_id
    OR OLD.deposit_inc_gst_cents IS DISTINCT FROM NEW.deposit_inc_gst_cents
    OR OLD.product_snapshot IS DISTINCT FROM NEW.product_snapshot
    OR OLD.cleaner_snapshot IS DISTINCT FROM NEW.cleaner_snapshot
    OR OLD.client_snapshot IS DISTINCT FROM NEW.client_snapshot
    OR OLD.site_snapshot IS DISTINCT FROM NEW.site_snapshot
  THEN
    RAISE EXCEPTION 'Product sale source snapshots are immutable.';
  END IF;

  IF OLD.agreed_purchase_price_inc_gst_cents IS DISTINCT FROM NEW.agreed_purchase_price_inc_gst_cents
    AND (
      OLD.status <> 'draft'
      OR EXISTS (
        SELECT 1 FROM contract_sale_invoices invoice
        WHERE invoice.sale_id = OLD.id AND invoice.status <> 'void'
      )
      OR EXISTS (
        SELECT 1 FROM contract_sale_agreements agreement
        WHERE agreement.sale_id = OLD.id AND agreement.status <> 'void'
      )
    )
  THEN
    RAISE EXCEPTION 'The purchase price cannot change after a tax invoice or agreement snapshot exists.';
  END IF;

  IF OLD.price_finalised_at IS NOT NULL AND NEW.price_finalised_at IS NULL THEN
    RAISE EXCEPTION 'A finalised product-sale price cannot be cleared.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_preview_quote_deletion(p_quote_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  product_ids uuid[];
  sale_ids uuid[];
  result jsonb;
  retention_reasons jsonb := '[]';
  in_flight integer;
  t text;
  n integer;
BEGIN
  SELECT * INTO q FROM quotes WHERE quote_ref = p_quote_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found.' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}') INTO product_ids FROM contract_products WHERE source_quote_id=q.id;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}') INTO sale_ids FROM contract_product_sales
    WHERE source_quote_id=q.id OR product_id=ANY(product_ids);
  -- These records remain in place, including all immutable commission and payment history.
  FOREACH t IN ARRAY ARRAY['contract_sale_invoices','contract_sale_payments','contract_sale_payment_allocations',
    'contract_sale_payment_plans','contract_sale_inspections','contract_sale_agreements',
    'contract_commission_assignments','contract_sale_site_assignments'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE sale_id=ANY($1)',t) INTO n USING sale_ids;
    IF n>0 THEN retention_reasons := retention_reasons || jsonb_build_array(jsonb_build_object('type',t,'count',n)); END IF;
  END LOOP;
  SELECT count(*) INTO in_flight FROM quote_send_attempts WHERE quote_ref=q.quote_ref AND status IN ('claimed','provider_accepted');
  result := jsonb_build_object(
    'quoteRef',q.quote_ref,'status',q.status,
    'contractProducts',cardinality(product_ids),'contractSales',cardinality(sale_ids),
    'productIds',product_ids,'saleIds',sale_ids,
    'linkedBookings',(SELECT count(*) FROM bookings WHERE quote_id=q.id),
    'winningOpportunities',(SELECT count(*) FROM crm_opportunities WHERE winning_quote_id=q.id),
    'opportunityLinksToRemove',(SELECT count(*) FROM crm_opportunity_quotes WHERE quote_id=q.id),
    'sendAttemptsToRemove',(SELECT count(*) FROM quote_send_attempts WHERE quote_ref=q.quote_ref),
    'documentVersionsToRemove',(SELECT count(*) FROM quote_final_document_versions WHERE quote_ref=q.quote_ref),
    'providerConfirmedSendAttempts',(SELECT count(*) FROM quote_send_attempts WHERE quote_ref=q.quote_ref AND status IN ('provider_accepted','finalized')),
    'finalDocumentSent',q.final_quote_sent_at IS NOT NULL,
    'blocked',in_flight>0,'retentionReasons',retention_reasons,
    'quoteUpdatedAt',q.updated_at
  );
  RETURN result || jsonb_build_object('previewToken',md5(result::text));
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_quote_with_override(
  p_quote_ref text, p_reason text, p_actor jsonb, p_linked_records text,
  p_override boolean, p_preview_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  preview jsonb;
  product_ids uuid[];
  sale_ids uuid[];
  snapshot jsonb;
BEGIN
  IF p_quote_ref IS NULL OR p_quote_ref !~ '^SC-[0-9]{8}-([A-Z0-9]{4}|[A-Z0-9]{8})$' THEN
    RAISE EXCEPTION 'Invalid quote reference.' USING ERRCODE='22023';
  END IF;
  IF COALESCE(p_actor->>'role','')<>'owner' OR COALESCE(btrim(p_actor->>'id'),'')='' OR COALESCE(btrim(p_actor->>'name'),'')='' THEN
    RAISE EXCEPTION 'Verified owner identity required.' USING ERRCODE='42501';
  END IF;
  -- Lock the current owner account so concurrent revocation cannot race the deletion.
  PERFORM id FROM admin_staff_accounts
    WHERE id::text=p_actor->>'id' AND username=p_actor->>'name' AND active=true AND role::text='owner'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active owner access required.' USING ERRCODE='28000'; END IF;
  IF length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 10 AND 500 OR p_linked_records IS NULL OR p_linked_records NOT IN ('keep','delete') THEN
    RAISE EXCEPTION 'Invalid deletion options.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO q FROM quotes WHERE quote_ref=p_quote_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found.' USING ERRCODE='P0002'; END IF;
  -- Parent locks prevent new linked records while the reviewed deletion is committed.
  PERFORM id FROM contract_products WHERE source_quote_id=q.id ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id),'{}') INTO product_ids FROM contract_products WHERE source_quote_id=q.id;
  PERFORM id FROM contract_product_sales WHERE source_quote_id=q.id OR product_id=ANY(product_ids) ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id),'{}') INTO sale_ids FROM contract_product_sales WHERE source_quote_id=q.id OR product_id=ANY(product_ids);
  preview := admin_preview_quote_deletion(p_quote_ref);
  IF p_preview_token IS DISTINCT FROM preview->>'previewToken' THEN
    RAISE EXCEPTION 'Deletion preview changed.' USING ERRCODE='40001';
  END IF;
  IF (preview->>'blocked')::boolean THEN RAISE EXCEPTION 'Quote email is still being processed.' USING ERRCODE='55000'; END IF;
  IF NOT COALESCE(p_override,false) AND (
    q.status='accepted' OR q.final_quote_sent_at IS NOT NULL OR cardinality(product_ids)>0 OR cardinality(sale_ids)>0
    OR (preview->>'linkedBookings')::int>0 OR (preview->>'winningOpportunities')::int>0
    OR (preview->>'providerConfirmedSendAttempts')::int>0
  ) THEN RAISE EXCEPTION 'Owner override is required.' USING ERRCODE='42501'; END IF;
  IF p_linked_records='delete' AND jsonb_array_length(preview->'retentionReasons')>0 THEN
    RAISE EXCEPTION 'Linked sales have retained history.' USING ERRCODE='23503';
  END IF;
  snapshot := jsonb_build_object(
    'quote',to_jsonb(q),
    'products',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]') FROM contract_products p WHERE id=ANY(product_ids)),
    'sales',(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]') FROM contract_product_sales s WHERE id=ANY(sale_ids)),
    'productVersions',(SELECT COALESCE(jsonb_agg(to_jsonb(v)),'[]') FROM contract_product_versions v WHERE product_id=ANY(product_ids)),
    'productInterests',(SELECT COALESCE(jsonb_agg(to_jsonb(i)),'[]') FROM contract_product_interests i WHERE product_id=ANY(product_ids)),
    'broadcastLinks',(SELECT COALESCE(jsonb_agg(to_jsonb(b)),'[]') FROM cleaner_broadcast_campaign_products b WHERE product_id=ANY(product_ids)),
    'documentVersions',(SELECT COALESCE(jsonb_agg(to_jsonb(v)),'[]') FROM quote_final_document_versions v WHERE quote_ref=q.quote_ref),
    'sendAttempts',(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]') FROM quote_send_attempts s WHERE quote_ref=q.quote_ref),
    'preview',preview
  );
  INSERT INTO quote_deletion_archive(quote_ref,actor,reason,linked_records,snapshot)
    VALUES(q.quote_ref,p_actor,btrim(p_reason),p_linked_records,snapshot);
  IF p_linked_records='delete' THEN
    DELETE FROM contract_product_sales WHERE id=ANY(sale_ids);
    DELETE FROM cleaner_broadcast_campaign_products WHERE product_id=ANY(product_ids);
    DELETE FROM contract_products WHERE id=ANY(product_ids);
  ELSE
    PERFORM set_config('app.deleting_quote_id',q.id::text,true);
    UPDATE contract_product_sales SET deleted_source_quote_ref=q.quote_ref, source_quote_id=NULL WHERE source_quote_id=q.id;
    UPDATE contract_products SET deleted_source_quote_ref=q.quote_ref, source_quote_id=NULL WHERE source_quote_id=q.id;
    PERFORM set_config('app.deleting_quote_id','',true);
  END IF;
  DELETE FROM crm_opportunity_quotes WHERE quote_id=q.id;
  -- Existing SET NULL foreign keys retain bookings and CRM opportunities.
  DELETE FROM quotes WHERE id=q.id;
  INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES('quote',q.quote_ref,'quote_deleted',
    jsonb_build_object('actorId',p_actor->>'id','actorName',p_actor->>'name','actorRole','owner',
      'reason',btrim(p_reason),'linkedRecords',p_linked_records,'ownerOverride',p_override,
      'products',cardinality(product_ids),'sales',cardinality(sale_ids),'uploadsDeleted',false));
  RETURN jsonb_build_object('quoteRef',q.quote_ref,'linkedRecords',p_linked_records,'uploadsDeleted',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_preview_quote_deletion(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_quote_with_override(text,text,jsonb,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_quote_deletion(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_quote_with_override(text,text,jsonb,text,boolean,text) TO service_role;
COMMIT;
