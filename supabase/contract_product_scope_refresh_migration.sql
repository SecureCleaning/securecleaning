-- Secure Cleaning - protected refresh of a draft contract-product scope from its winning quote.
-- Apply after contract_product_saved_quote_won_migration.sql.

CREATE OR REPLACE FUNCTION refresh_contract_product_cleaner_scope(
  p_product_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_source_quote_document_version INTEGER,
  p_cleaner_scope_snapshot JSONB,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_row contract_products%ROWTYPE;
  source_inputs JSONB;
  source_state TEXT;
  refreshed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
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
  IF p_actor_role = 'agent' AND (
    product_row.assigned_staff_id IS DISTINCT FROM p_actor_id
    OR product_row.state IS DISTINCT FROM p_actor_state
  ) THEN
    RAISE EXCEPTION 'product outside agent access' USING ERRCODE = '42501';
  END IF;
  IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object'
     OR jsonb_typeof(p_cleaner_scope_snapshot->'rooms') <> 'array'
     OR jsonb_array_length(p_cleaner_scope_snapshot->'rooms') = 0 THEN
    RAISE EXCEPTION 'cleaner scope snapshot is incomplete' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(final_quote_document->'inputs', firm_quote_workflow->'revisedInputs', inputs)
    INTO source_inputs
  FROM quotes
  WHERE id = product_row.source_quote_id
  FOR SHARE;
  IF source_inputs IS NULL OR jsonb_typeof(source_inputs) <> 'object' THEN
    RAISE EXCEPTION 'winning quote snapshot unavailable' USING ERRCODE = '23514';
  END IF;
  source_state := CASE LOWER(BTRIM(COALESCE(source_inputs->>'city', '')))
    WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' ELSE NULL END;
  IF UPPER(BTRIM(COALESCE(p_cleaner_scope_snapshot->>'state', ''))) IS DISTINCT FROM source_state
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'suburb', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'suburb', ''))
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'premisesType', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'premisesType', ''))
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'frequency', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'frequency', ''))
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'timePreference', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'timePreference', '')) THEN
    RAISE EXCEPTION 'cleaner scope does not match winning quote' USING ERRCODE = '23514';
  END IF;

  UPDATE contract_products SET
    cleaner_scope_snapshot = p_cleaner_scope_snapshot,
    source_quote_document_version = GREATEST(1, p_source_quote_document_version),
    updated_at = refreshed_at
  WHERE id = p_product_id
  RETURNING updated_at INTO refreshed_at;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', p_product_id::TEXT, 'contract_product.scope_refreshed_from_winning_quote',
    jsonb_build_object('quoteId', product_row.source_quote_id, 'actorId', p_actor_id,
      'sourceQuoteDocumentVersion', GREATEST(1, p_source_quote_document_version)));
  RETURN refreshed_at;
END;
$$;

REVOKE ALL ON FUNCTION refresh_contract_product_cleaner_scope(UUID, TIMESTAMPTZ, INTEGER, JSONB, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_contract_product_cleaner_scope(UUID, TIMESTAMPTZ, INTEGER, JSONB, UUID, TEXT, TEXT)
  TO service_role;
