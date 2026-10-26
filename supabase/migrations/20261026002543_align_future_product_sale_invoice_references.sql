-- Future inserts only: preserve all existing product, sale and invoice references.
-- Keep the product's numeric reference, including leading zeroes, on the sale and
-- full-sale invoice. A replacement sale gets the same -R2/-R3 suffix on both.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_contract_sale_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  product_reference text;
  reference_base text;
  candidate_sale text;
  candidate_invoice text;
  attempt integer := 1;
BEGIN
  -- Serialize reservations for the same product, including cancelled-sale retries.
  SELECT product_code INTO product_reference FROM public.contract_products
    WHERE id = NEW.product_id FOR UPDATE;
  IF NOT FOUND OR product_reference !~ '^C[0-9]+$' THEN
    RAISE EXCEPTION 'A valid product reference is required before creating a sale.';
  END IF;
  reference_base := to_char(CURRENT_DATE, 'YYYY') || '-' || substring(product_reference FROM 2);
  LOOP
    candidate_sale := 'PS-' || reference_base || CASE WHEN attempt = 1 THEN '' ELSE '-R' || attempt::text END;
    candidate_invoice := 'SCINV-' || reference_base || CASE WHEN attempt = 1 THEN '' ELSE '-R' || attempt::text END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.contract_product_sales WHERE sale_code = candidate_sale OR aligned_invoice_number = candidate_invoice)
      AND NOT EXISTS (SELECT 1 FROM public.contract_sale_invoices WHERE invoice_number = candidate_invoice);
    attempt := attempt + 1;
  END LOOP;
  -- Ignore caller/legacy sequence values: the product is authoritative for new sales.
  NEW.sale_code := candidate_sale;
  NEW.aligned_invoice_number := candidate_invoice;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_contract_sale_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contract_sale_invoice_number() TO service_role;

-- The existing invoice insert trigger copies aligned_invoice_number for full-sale
-- invoices, including sales created before this migration. Legacy deposits and
-- balances keep their existing numbering behavior. No sequences or rows rewritten.
COMMIT;
