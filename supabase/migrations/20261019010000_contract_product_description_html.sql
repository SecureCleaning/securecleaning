-- Preserve plain descriptions for existing integrations; formatted descriptions are optional.
ALTER TABLE public.contract_products ADD COLUMN IF NOT EXISTS description_html text;
