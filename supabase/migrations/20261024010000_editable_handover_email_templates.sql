-- Editable Product Sales handover introduction templates.
-- Apply before deploying the handover-template.update API and workspace editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_sale_handover_email_templates (
  id text PRIMARY KEY CHECK (id IN ('handover-client', 'handover-cleaner')),
  audience text NOT NULL CHECK (audience IN ('client', 'cleaner')),
  subject_template text NOT NULL CHECK (length(trim(subject_template)) BETWEEN 3 AND 200),
  body_text text NOT NULL CHECK (length(trim(body_text)) BETWEEN 10 AND 10000),
  body_html text NOT NULL DEFAULT '' CHECK (length(body_html) <= 120000),
  body_document jsonb,
  updated_by_staff_id uuid REFERENCES public.admin_staff_accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_sale_handover_email_template_audience_matches_id
    CHECK (id = 'handover-' || audience)
);

INSERT INTO public.contract_sale_handover_email_templates(id, audience, subject_template, body_text)
VALUES
  (
    'handover-client',
    'client',
    'Secure Cleaning - Your cleaner details - <<service_place>>',
    E'Hi <<recipient_first_name>>,\n\nThank you for choosing Secure Cleaning. The handover for your cleaning service is complete. Below are the direct contact details for your cleaner, so you can coordinate access, day-to-day requirements and service feedback.\n\n<<counterparty_heading>>\n<<counterparty_details>>\n\nService details\n<<service_details>>\n\n<<billing_guidance>>\n\nPlease contact each other directly for routine service matters. If an issue cannot be resolved together, reply to this email and Secure Cleaning will help coordinate the next steps.'
  ),
  (
    'handover-cleaner',
    'cleaner',
    'Secure Cleaning - Your client details - <<service_place>>',
    E'Hi <<recipient_first_name>>,\n\nThank you for working with Secure Cleaning. The sale and handover are complete. Below are the client contact and service details to help you coordinate the ongoing cleaning service.\n\n<<counterparty_heading>>\n<<counterparty_details>>\n\nService details\n<<service_details>>\n\n<<billing_guidance>>\n\nPlease contact each other directly for routine service matters. If an issue cannot be resolved together, reply to this email and Secure Cleaning will help coordinate the next steps.'
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.contract_sale_handover_email_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contract_sale_handover_email_templates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contract_sale_handover_email_templates TO service_role;

COMMIT;
