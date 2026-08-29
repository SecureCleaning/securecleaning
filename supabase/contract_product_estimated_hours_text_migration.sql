-- Secure Cleaning - allow a cleaner-facing estimated-hours range on contract products.
-- Apply after contract_products_migration.sql and before deploying the matching application code.

DO $$
DECLARE
  column_type TEXT;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contract_products'
    AND column_name = 'estimated_hours_per_visit';

  IF column_type IS NULL THEN
    RAISE EXCEPTION 'contract_products.estimated_hours_per_visit is missing';
  ELSIF column_type <> 'text' THEN
    ALTER TABLE contract_products
      ALTER COLUMN estimated_hours_per_visit TYPE TEXT
      USING NULLIF(
        REGEXP_REPLACE(
          REGEXP_REPLACE(estimated_hours_per_visit::TEXT, '(\.\d*?)0+$', '\1'),
          '\.$',
          ''
        ),
        ''
      );
  END IF;
END $$;

COMMENT ON COLUMN contract_products.estimated_hours_per_visit IS
  'Optional cleaner-facing duration or range, for example 1.5 - 2 hours.';
