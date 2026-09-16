-- Apply after contract_sale_tax_invoice_workflow_migration.sql, before rich invoice editing.
-- Nullable additions preserve legacy plain-text templates and immutable invoices.
BEGIN;
ALTER TABLE public.contract_sale_invoice_templates ADD COLUMN IF NOT EXISTS email_intro_html TEXT;
ALTER TABLE public.contract_sale_invoice_templates ADD COLUMN IF NOT EXISTS email_intro_document JSONB;
ALTER TABLE public.contract_sale_invoices ADD COLUMN IF NOT EXISTS email_intro_html_snapshot TEXT;
COMMIT;
