-- Secure Cleaning - use PostgreSQL's built-in UUID generator in the won-product RPC.
-- Apply after contract_product_saved_quote_won_migration.sql.

DO $$
DECLARE
  target_function REGPROCEDURE := to_regprocedure(
    'public.close_crm_opportunity_won_and_create_product(uuid,uuid,timestamp with time zone,date,text,text,jsonb,uuid,text,text)'
  );
  function_definition TEXT;
  legacy_call_count INTEGER;
BEGIN
  IF target_function IS NULL THEN
    RAISE EXCEPTION 'close-won product function is missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT pg_get_functiondef(target_function::OID)
  INTO function_definition;

  legacy_call_count := (
    LENGTH(function_definition) - LENGTH(REPLACE(function_definition, 'uuid_generate_v4()', ''))
  ) / LENGTH('uuid_generate_v4()');

  IF legacy_call_count = 1 THEN
    EXECUTE REPLACE(function_definition, 'uuid_generate_v4()', 'gen_random_uuid()');
  ELSIF legacy_call_count = 0 AND POSITION('gen_random_uuid()' IN function_definition) > 0 THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'unexpected UUID generator state in close-won product function'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) SECURITY DEFINER;
ALTER FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) TO service_role;
