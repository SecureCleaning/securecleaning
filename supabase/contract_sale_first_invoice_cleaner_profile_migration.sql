-- Apply after contract_product_sales_migration.sql, cleaners_migration.sql,
-- rich_email_composer_migration.sql and staff_accounts_migration.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_sale_cleaner_profile_templates (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  subject_template TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  body_document JSONB,
  updated_by_staff_id UUID REFERENCES public.admin_staff_accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.contract_sale_cleaner_profile_templates(
  id, subject_template, body_text, body_html
) VALUES (
  'default',
  'Please confirm your Secure Cleaning details',
  E'Hi <<cleaner_first_name>>,\n\nThank you for purchasing a cleaning contract through Secure Cleaning. As this is the first invoice we have sent you, please review your cleaner record and add or correct any missing information.\n\nReview and update your details: <<profile_update_link>>\n\nThis private link expires in 48 hours.\n\nKind regards,\nSecure Cleaning',
  '<p>Hi &lt;&lt;cleaner_first_name&gt;&gt;,</p><p>Thank you for purchasing a cleaning contract through Secure Cleaning. As this is the first invoice we have sent you, please review your cleaner record and add or correct any missing information.</p><p><a href="&lt;&lt;profile_update_link&gt;&gt;" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Review and update your details</a></p><p>This private link expires in 48 hours.</p><p>Kind regards,<br>Secure Cleaning</p>'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.contract_sale_cleaner_profile_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id UUID NOT NULL UNIQUE REFERENCES public.cleaners(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL UNIQUE REFERENCES public.contract_sale_invoices(id) ON DELETE RESTRICT,
  triggered_by_staff_id UUID NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  copied_agent_id UUID REFERENCES public.admin_staff_accounts(id) ON DELETE SET NULL,
  recipient_email_snapshot TEXT NOT NULL,
  copied_email_snapshot TEXT,
  subject_snapshot TEXT NOT NULL,
  body_text_snapshot TEXT NOT NULL,
  body_html_snapshot TEXT NOT NULL,
  body_document_snapshot JSONB,
  final_html_snapshot TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'sending'
    CHECK (delivery_status IN ('sending', 'sent', 'failed', 'unknown')),
  provider_message_id TEXT,
  delivery_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_sale_cleaner_profile_requests_sale
  ON public.contract_sale_cleaner_profile_requests(sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_sale_cleaner_profile_requests_delivery
  ON public.contract_sale_cleaner_profile_requests(delivery_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_contract_sale_cleaner_profile_request(
  p_cleaner_id UUID,
  p_sale_id UUID,
  p_invoice_id UUID,
  p_actor_id UUID,
  p_subject_snapshot TEXT,
  p_body_text_snapshot TEXT,
  p_body_html_snapshot TEXT,
  p_body_document_snapshot JSONB,
  p_final_html_snapshot TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT;
  sale_row public.contract_product_sales%ROWTYPE;
  invoice_row public.contract_sale_invoices%ROWTYPE;
  cleaner_email TEXT;
  copied_agent UUID;
  copied_email TEXT;
  request_id UUID;
BEGIN
  SELECT role::TEXT INTO actor_role
  FROM public.admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE;
  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_cleaner_id::TEXT, 0));
  SELECT * INTO sale_row FROM public.contract_product_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR sale_row.cleaner_id IS DISTINCT FROM p_cleaner_id OR sale_row.status::TEXT = 'cancelled' THEN
    RAISE EXCEPTION 'Active product sale not found.' USING ERRCODE = '42501';
  END IF;
  IF actor_role = 'agent' AND sale_row.assigned_staff_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invoice_row FROM public.contract_sale_invoices
  WHERE id = p_invoice_id AND sale_id = p_sale_id AND invoice_type::TEXT = 'sale' FOR UPDATE;
  IF NOT FOUND OR invoice_row.delivery_status::TEXT <> 'sent' THEN
    RAISE EXCEPTION 'The first sale invoice must be sent before requesting cleaner details.';
  END IF;

  SELECT LOWER(BTRIM(email)) INTO cleaner_email FROM public.cleaners WHERE id = p_cleaner_id;
  IF cleaner_email IS NULL OR cleaner_email <> LOWER(BTRIM(invoice_row.recipient_email_snapshot)) THEN
    RAISE EXCEPTION 'Cleaner and invoice recipients do not match.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contract_sale_cleaner_profile_requests
    WHERE cleaner_id = p_cleaner_id
  ) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.contract_sale_invoices prior_invoice
    JOIN public.contract_product_sales prior_sale ON prior_sale.id = prior_invoice.sale_id
    WHERE prior_sale.cleaner_id = p_cleaner_id
      AND prior_invoice.id <> p_invoice_id
      AND prior_invoice.delivery_status::TEXT = 'sent'
      AND (
        prior_invoice.issued_at < invoice_row.issued_at
        OR (prior_invoice.issued_at = invoice_row.issued_at AND prior_invoice.id::TEXT < invoice_row.id::TEXT)
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT id, LOWER(BTRIM(email)) INTO copied_agent, copied_email
  FROM public.admin_staff_accounts
  WHERE id = sale_row.created_by_staff_id
    AND active = TRUE
    AND role::TEXT = 'agent'
    AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

  INSERT INTO public.contract_sale_cleaner_profile_requests(
    cleaner_id, sale_id, invoice_id, triggered_by_staff_id, copied_agent_id,
    recipient_email_snapshot, copied_email_snapshot, subject_snapshot,
    body_text_snapshot, body_html_snapshot, body_document_snapshot, final_html_snapshot
  ) VALUES (
    p_cleaner_id, p_sale_id, p_invoice_id, p_actor_id, copied_agent,
    cleaner_email, copied_email, p_subject_snapshot,
    p_body_text_snapshot, p_body_html_snapshot, p_body_document_snapshot, p_final_html_snapshot
  ) RETURNING id INTO request_id;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_sale', p_sale_id::TEXT, 'contract_sale.cleaner_profile_email.reserved', jsonb_build_object(
    'actorId', p_actor_id,
    'cleanerId', p_cleaner_id,
    'invoiceId', p_invoice_id,
    'requestId', request_id,
    'copiedSaleCreator', copied_agent IS NOT NULL
  ));
  RETURN request_id;
END;
$$;

ALTER TABLE public.contract_sale_cleaner_profile_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sale_cleaner_profile_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contract_sale_cleaner_profile_templates, public.contract_sale_cleaner_profile_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contract_sale_cleaner_profile_templates TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contract_sale_cleaner_profile_requests TO service_role;
REVOKE ALL ON FUNCTION public.reserve_contract_sale_cleaner_profile_request(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contract_sale_cleaner_profile_request(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,JSONB,TEXT) TO service_role;

COMMIT;
