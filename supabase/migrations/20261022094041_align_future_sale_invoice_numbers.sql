-- Preserve all existing identifiers. Future product sales reserve a matching
-- full-sale invoice number, while the shared sequence may skip values used by
-- legacy invoice types.
BEGIN;

LOCK TABLE public.contract_product_sales, public.contract_sale_invoices IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.contract_product_sales
  ADD COLUMN IF NOT EXISTS aligned_invoice_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_product_sales_aligned_invoice_number
  ON public.contract_product_sales(aligned_invoice_number)
  WHERE aligned_invoice_number IS NOT NULL;

DO $$
DECLARE
  high_water_mark BIGINT;
BEGIN
  SELECT GREATEST(
    (SELECT last_value FROM public.contract_sale_code_seq),
    (SELECT last_value FROM public.contract_sale_invoice_number_seq),
    COALESCE((SELECT MAX((SUBSTRING(sale_code FROM '([0-9]+)$'))::BIGINT) FROM public.contract_product_sales), 0),
    COALESCE((SELECT MAX((SUBSTRING(invoice_number FROM '([0-9]+)$'))::BIGINT) FROM public.contract_sale_invoices), 0),
    999
  ) INTO high_water_mark;

  PERFORM setval('public.contract_sale_code_seq', high_water_mark, TRUE);
  PERFORM setval('public.contract_sale_invoice_number_seq', high_water_mark, TRUE);
END;
$$;

ALTER TABLE public.contract_sale_invoices
  ALTER COLUMN invoice_number SET DEFAULT (
    'SCINV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.contract_sale_code_seq')::TEXT, 5, '0')
  );

CREATE OR REPLACE FUNCTION public.reserve_contract_sale_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.aligned_invoice_number IS NULL THEN
    NEW.aligned_invoice_number := REGEXP_REPLACE(NEW.sale_code, '^PS-', 'SCINV-');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_number_reservation ON public.contract_product_sales;
CREATE TRIGGER trg_contract_sale_number_reservation
  BEFORE INSERT ON public.contract_product_sales
  FOR EACH ROW EXECUTE FUNCTION public.reserve_contract_sale_invoice_number();

CREATE OR REPLACE FUNCTION public.apply_contract_sale_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  reserved_number TEXT;
BEGIN
  IF NEW.invoice_type = 'sale' THEN
    SELECT aligned_invoice_number INTO reserved_number
    FROM public.contract_product_sales
    WHERE id = NEW.sale_id;

    IF reserved_number IS NOT NULL THEN
      NEW.invoice_number := reserved_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_invoice_number ON public.contract_sale_invoices;
CREATE TRIGGER trg_contract_sale_invoice_number
  BEFORE INSERT ON public.contract_sale_invoices
  FOR EACH ROW EXECUTE FUNCTION public.apply_contract_sale_invoice_number();

-- Keep the current sale snapshot guard intact, including draft price editing
-- and retained deleted-quote references. Guard only this new reservation here.
CREATE OR REPLACE FUNCTION public.protect_contract_sale_invoice_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.aligned_invoice_number IS DISTINCT FROM NEW.aligned_invoice_number THEN
    RAISE EXCEPTION 'The reserved sale invoice number is immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_invoice_reservation_guard ON public.contract_product_sales;
CREATE TRIGGER trg_contract_sale_invoice_reservation_guard
  BEFORE UPDATE ON public.contract_product_sales
  FOR EACH ROW EXECUTE FUNCTION public.protect_contract_sale_invoice_reservation();

REVOKE ALL ON FUNCTION public.protect_contract_sale_invoice_reservation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_contract_sale_invoice_reservation() TO service_role;

REVOKE ALL ON FUNCTION public.reserve_contract_sale_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_contract_sale_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contract_sale_invoice_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_contract_sale_invoice_number() TO service_role;

COMMIT;
