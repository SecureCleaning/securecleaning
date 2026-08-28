-- Secure Cleaning - allow a won opportunity to use the latest saved quote snapshot.
-- Apply after contract_products_migration.sql.

CREATE OR REPLACE FUNCTION close_crm_opportunity_won_and_create_product(
  p_opportunity_id UUID,
  p_quote_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_acceptance_date DATE,
  p_acceptance_method TEXT,
  p_acceptance_note TEXT,
  p_cleaner_scope_snapshot JSONB,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  quote_row quotes%ROWTYPE;
  existing_product_id UUID;
  product_id UUID := uuid_generate_v4();
  source_inputs JSONB;
  source_kind TEXT;
  source_version INTEGER;
  source_city TEXT;
  source_state TEXT;
  source_suburb TEXT;
  source_premises TEXT;
  source_frequency TEXT;
  source_time TEXT;
  source_rate_cents INTEGER;
  source_annual_visits INTEGER;
  source_annual_value INTEGER;
  source_heading TEXT;
  source_start_date DATE;
  actor_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) INTO actor_is_valid;
  IF NOT actor_is_valid THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO opportunity_row FROM crm_opportunities
  WHERE id = p_opportunity_id FOR UPDATE;
  IF opportunity_row.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_role = 'agent' AND opportunity_row.assigned_staff_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'opportunity not assigned to agent' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO existing_product_id FROM contract_products
  WHERE opportunity_id = p_opportunity_id;
  IF existing_product_id IS NOT NULL THEN RETURN existing_product_id; END IF;
  IF opportunity_row.closed_at IS NOT NULL OR opportunity_row.stage IN ('won', 'lost', 'cancelled') THEN
    RAISE EXCEPTION 'opportunity is already closed' USING ERRCODE = '23514';
  END IF;
  IF opportunity_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'opportunity changed while editing' USING ERRCODE = '40001';
  END IF;
  IF p_acceptance_date IS NULL OR p_acceptance_date > (NOW() AT TIME ZONE 'Australia/Melbourne')::DATE
     OR p_acceptance_method NOT IN ('email', 'signed_agreement', 'phone', 'other')
     OR LENGTH(BTRIM(COALESCE(p_acceptance_note, ''))) < 3 THEN
    RAISE EXCEPTION 'acceptance evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_opportunity_quotes
    WHERE opportunity_id = p_opportunity_id AND quote_id = p_quote_id
  ) THEN
    RAISE EXCEPTION 'quote is not linked to opportunity' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO quote_row FROM quotes WHERE id = p_quote_id FOR SHARE;
  IF quote_row.id IS NULL THEN
    RAISE EXCEPTION 'saved quote not found' USING ERRCODE = '23514';
  END IF;
  IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'cleaner scope snapshot is required' USING ERRCODE = '23514';
  END IF;

  IF quote_row.final_quote_document IS NOT NULL THEN
    source_kind := 'final';
    source_inputs := quote_row.final_quote_document->'inputs';
    source_version := COALESCE(quote_row.final_quote_document_version, 1);
    source_rate_cents := ROUND(COALESCE(NULLIF(quote_row.final_quote_document #>> '{displayPrice,low}', '')::NUMERIC, 0) * 100);
  ELSIF jsonb_typeof(quote_row.firm_quote_workflow) = 'object'
        AND jsonb_typeof(quote_row.firm_quote_workflow->'revisedInputs') = 'object' THEN
    source_kind := 'saved_workflow';
    source_inputs := quote_row.firm_quote_workflow->'revisedInputs';
    source_version := 1;
    source_rate_cents := CASE
      WHEN COALESCE(p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}', '') ~ '^[0-9]+$'
        THEN (p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}')::INTEGER
      ELSE 0
    END;
  ELSE
    source_kind := 'original';
    source_inputs := quote_row.inputs;
    source_version := 1;
    source_rate_cents := CASE
      WHEN COALESCE(p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}', '') ~ '^[0-9]+$'
        THEN (p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}')::INTEGER
      ELSE 0
    END;
  END IF;

  IF source_inputs IS NULL OR jsonb_typeof(source_inputs) <> 'object' THEN
    RAISE EXCEPTION 'saved quote inputs are incomplete' USING ERRCODE = '23514';
  END IF;
  source_city := LOWER(BTRIM(COALESCE(source_inputs->>'city', '')));
  source_state := CASE source_city WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' ELSE NULL END;
  IF p_actor_role = 'agent' AND source_state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'product state is outside agent region' USING ERRCODE = '42501';
  END IF;
  source_suburb := BTRIM(COALESCE(source_inputs->>'suburb', ''));
  source_premises := BTRIM(COALESCE(source_inputs->>'premisesType', 'commercial'));
  source_frequency := BTRIM(COALESCE(source_inputs->>'frequency', ''));
  source_time := BTRIM(COALESCE(source_inputs->>'timePreference', ''));
  source_annual_visits := CASE source_frequency
    WHEN 'daily' THEN 260 WHEN '3x_week' THEN 156 WHEN '2x_week' THEN 104
    WHEN 'weekly' THEN 52 WHEN 'fortnightly' THEN 26 WHEN 'once_off' THEN 1 ELSE 0 END;
  IF source_state IS NULL OR source_suburb = '' OR source_frequency = '' OR source_time = ''
     OR source_rate_cents <= 0 OR source_annual_visits <= 0 THEN
    RAISE EXCEPTION 'saved quote cannot seed a complete product' USING ERRCODE = '23514';
  END IF;
  IF UPPER(BTRIM(COALESCE(p_cleaner_scope_snapshot->>'state', ''))) IS DISTINCT FROM source_state
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'suburb', '')) IS DISTINCT FROM source_suburb
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'premisesType', '')) IS DISTINCT FROM source_premises
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'frequency', '')) IS DISTINCT FROM source_frequency
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'timePreference', '')) IS DISTINCT FROM source_time THEN
    RAISE EXCEPTION 'cleaner scope does not match saved quote' USING ERRCODE = '23514';
  END IF;

  source_start_date := CASE
    WHEN COALESCE(source_inputs->>'preferredStartDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN (source_inputs->>'preferredStartDate')::DATE
    ELSE NULL
  END;
  source_annual_value := source_rate_cents * source_annual_visits;
  source_heading := INITCAP(REPLACE(source_frequency, '_', ' ')) || ' ' ||
    INITCAP(REPLACE(source_premises, '_', ' ')) || ' cleaning contract - ' || source_suburb || ', ' || source_state;

  INSERT INTO contract_products(
    id, product_code, opportunity_id, source_quote_id, source_quote_document_version,
    assigned_staff_id, heading, description, state, suburb, premises_type, start_date,
    frequency, annual_visits, time_preference, client_price_per_visit_ex_gst_cents,
    annual_contract_value_ex_gst_cents, purchase_price_ex_gst_cents, cleaner_scope_snapshot,
    created_by_staff_id
  ) VALUES (
    product_id, 'C' || LPAD(nextval('contract_product_code_seq')::TEXT, 6, '0'),
    p_opportunity_id, p_quote_id, source_version, opportunity_row.assigned_staff_id,
    source_heading, COALESCE(p_cleaner_scope_snapshot->>'summary', ''), source_state, source_suburb,
    source_premises, source_start_date, source_frequency, source_annual_visits, source_time,
    source_rate_cents, source_annual_value, ROUND(source_annual_value * 0.5),
    p_cleaner_scope_snapshot - 'sourcePricing', p_actor_id
  );

  UPDATE crm_opportunities SET
    stage = 'won', closed_at = NOW(), winning_quote_id = p_quote_id,
    acceptance_date = p_acceptance_date, acceptance_method = p_acceptance_method,
    acceptance_note = BTRIM(p_acceptance_note), updated_at = NOW()
  WHERE id = p_opportunity_id;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', product_id::TEXT, 'contract_product.created_from_won_opportunity',
    jsonb_build_object(
      'opportunityId', p_opportunity_id,
      'quoteId', p_quote_id,
      'quoteSnapshotKind', source_kind,
      'actorId', p_actor_id
    ));
  RETURN product_id;
END;
$$;

REVOKE ALL ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) TO service_role;
