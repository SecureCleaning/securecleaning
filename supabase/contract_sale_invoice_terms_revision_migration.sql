-- Apply after contract_sale_invoice_bank_details_migration.sql; no existing invoice is rewritten.
BEGIN;
ALTER TABLE public.contract_sale_invoice_bank_revisions
 ADD COLUMN IF NOT EXISTS payment_terms_snapshot text
 CHECK(payment_terms_snapshot IS NULL OR length(trim(payment_terms_snapshot)) BETWEEN 20 AND 1500);
-- Existing append-only guard, owner lock, audit trigger and restricted grants remain in force.
COMMIT;
