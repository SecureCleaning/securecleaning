-- Apply before deploying editable cleaner scope email drafts/templates.
BEGIN;
CREATE TABLE public.contract_sale_scope_email_templates (
  id text PRIMARY KEY CHECK (id = 'default'),
  subject_template text NOT NULL CHECK (length(trim(subject_template)) BETWEEN 1 AND 200),
  body_text text NOT NULL CHECK (length(trim(body_text)) BETWEEN 1 AND 10000),
  body_html text NOT NULL DEFAULT '' CHECK (length(body_html) <= 120000),
  body_document jsonb CHECK (body_document IS NULL OR (jsonb_typeof(body_document) = 'object' AND octet_length(body_document::text) <= 200000)),
  updated_by_staff_id uuid REFERENCES public.admin_staff_accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_sale_scope_email_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_sale_scope_email_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_sale_scope_email_templates TO service_role;
COMMENT ON TABLE public.contract_sale_scope_email_templates IS 'Private cleaner scope email master template. Server authorizes owner/manager edits; agents use merged drafts. No customer merge fields.';
-- An absent row uses the application default until an administrator saves it.
COMMIT;
