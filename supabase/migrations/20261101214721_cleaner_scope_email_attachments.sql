-- Apply before deploying cleaner-scope email. Existing rows and send locks are unchanged.
BEGIN;
ALTER TABLE public.contract_sale_followups
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(attachments) = 'array' AND octet_length(attachments::text) <= 4000000);
COMMENT ON COLUMN public.contract_sale_followups.attachments IS 'Exact server-generated email attachments: filename and base64 content. Staff service access only.';
REVOKE ALL ON public.contract_sale_followups FROM PUBLIC, anon, authenticated;
COMMIT;
