-- Apply after contract_product_sales_migration.sql and before deploying follow-up code.
-- Service-role access only; the API rechecks staff assignment and product region.
BEGIN;
CREATE TABLE IF NOT EXISTS public.contract_sale_followups (
  id UUID PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  audience TEXT NOT NULL CHECK (audience IN ('client', 'cleaner')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  html TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sent_by_staff_id UUID NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'unknown')),
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_sale_followups_history ON public.contract_sale_followups(sale_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS contract_sale_followups_unresolved ON public.contract_sale_followups(sale_id, audience) WHERE status IN ('pending', 'unknown');
ALTER TABLE public.contract_sale_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_sale_followups FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_sale_followups TO service_role;
COMMIT;
