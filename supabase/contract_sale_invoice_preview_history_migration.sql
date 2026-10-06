-- Secure Cleaning - invoice payment details and immutable email delivery history.
-- Apply after contract_sale_document_bundle_workflow_migration.sql.

BEGIN;

ALTER TABLE contract_sale_invoice_templates
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_bsb TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reference_template TEXT NOT NULL DEFAULT '{invoice_number}';

ALTER TABLE contract_sale_invoice_templates
  DROP CONSTRAINT IF EXISTS contract_sale_invoice_templates_bank_details_check,
  DROP CONSTRAINT IF EXISTS contract_sale_invoice_templates_payment_reference_check;
ALTER TABLE contract_sale_invoice_templates
  ADD CONSTRAINT contract_sale_invoice_templates_bank_details_check CHECK (
    (bank_account_name = '' AND bank_name = '' AND bank_bsb = '' AND bank_account_number = '')
    OR (
      LENGTH(TRIM(bank_account_name)) BETWEEN 2 AND 160
      AND bank_bsb ~ '^[0-9]{3}-[0-9]{3}$'
      AND bank_account_number ~ '^[0-9 -]+$'
      AND LENGTH(REGEXP_REPLACE(bank_account_number, '[^0-9]', '', 'g')) BETWEEN 4 AND 16
    )
  ),
  ADD CONSTRAINT contract_sale_invoice_templates_payment_reference_check
    CHECK (LENGTH(TRIM(payment_reference_template)) BETWEEN 1 AND 120);

ALTER TABLE contract_sale_invoices
  ADD COLUMN IF NOT EXISTS bank_account_name_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_bsb_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reference_template_snapshot TEXT NOT NULL DEFAULT '{invoice_number}';

CREATE TABLE IF NOT EXISTS contract_sale_invoice_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('invoice_only', 'document_bundle')),
  recipient_email_snapshot TEXT NOT NULL,
  reply_to_email_snapshot TEXT NOT NULL,
  subject_snapshot TEXT NOT NULL,
  html_snapshot TEXT NOT NULL,
  attachment_names_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (JSONB_TYPEOF(attachment_names_snapshot) = 'array'),
  sent_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  sender_name_snapshot TEXT NOT NULL,
  sender_email_snapshot TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'unknown')),
  provider_message_id TEXT,
  delivery_error TEXT,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_sale_invoice_email_deliveries_invoice_sale_fk
    FOREIGN KEY(invoice_id, sale_id)
    REFERENCES contract_sale_invoices(id, sale_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_contract_sale_invoice_email_deliveries_invoice
  ON contract_sale_invoice_email_deliveries(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_sale_invoice_email_deliveries_sale
  ON contract_sale_invoice_email_deliveries(sale_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_sale_invoice_email_deliveries_provider
  ON contract_sale_invoice_email_deliveries(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_contract_sale_invoice_email_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id
    OR OLD.sale_id IS DISTINCT FROM NEW.sale_id
    OR OLD.delivery_kind IS DISTINCT FROM NEW.delivery_kind
    OR OLD.recipient_email_snapshot IS DISTINCT FROM NEW.recipient_email_snapshot
    OR OLD.reply_to_email_snapshot IS DISTINCT FROM NEW.reply_to_email_snapshot
    OR OLD.subject_snapshot IS DISTINCT FROM NEW.subject_snapshot
    OR OLD.html_snapshot IS DISTINCT FROM NEW.html_snapshot
    OR OLD.attachment_names_snapshot IS DISTINCT FROM NEW.attachment_names_snapshot
    OR OLD.sent_by_staff_id IS DISTINCT FROM NEW.sent_by_staff_id
    OR OLD.sender_name_snapshot IS DISTINCT FROM NEW.sender_name_snapshot
    OR OLD.sender_email_snapshot IS DISTINCT FROM NEW.sender_email_snapshot
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.delivery_status <> 'pending'
  THEN
    RAISE EXCEPTION 'Invoice email delivery snapshots are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_sale_invoice_email_delivery ON contract_sale_invoice_email_deliveries;
CREATE TRIGGER trg_contract_sale_invoice_email_delivery BEFORE UPDATE ON contract_sale_invoice_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION protect_contract_sale_invoice_email_delivery();

CREATE OR REPLACE FUNCTION protect_contract_sale_invoice_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
    OR OLD.sale_id IS DISTINCT FROM NEW.sale_id
    OR OLD.invoice_type IS DISTINCT FROM NEW.invoice_type
    OR OLD.description_snapshot IS DISTINCT FROM NEW.description_snapshot
    OR OLD.total_inc_gst_cents IS DISTINCT FROM NEW.total_inc_gst_cents
    OR OLD.gst_component_cents IS DISTINCT FROM NEW.gst_component_cents
    OR OLD.deposit_required_inc_gst_cents IS DISTINCT FROM NEW.deposit_required_inc_gst_cents
    OR OLD.due_on IS DISTINCT FROM NEW.due_on
    OR OLD.payment_terms_snapshot IS DISTINCT FROM NEW.payment_terms_snapshot
    OR OLD.recipient_name_snapshot IS DISTINCT FROM NEW.recipient_name_snapshot
    OR OLD.recipient_business_snapshot IS DISTINCT FROM NEW.recipient_business_snapshot
    OR OLD.recipient_email_snapshot IS DISTINCT FROM NEW.recipient_email_snapshot
    OR OLD.recipient_address_snapshot IS DISTINCT FROM NEW.recipient_address_snapshot
    OR OLD.recipient_abn_snapshot IS DISTINCT FROM NEW.recipient_abn_snapshot
    OR OLD.supplier_name_snapshot IS DISTINCT FROM NEW.supplier_name_snapshot
    OR OLD.supplier_abn_snapshot IS DISTINCT FROM NEW.supplier_abn_snapshot
    OR OLD.supplier_email_snapshot IS DISTINCT FROM NEW.supplier_email_snapshot
    OR OLD.invoice_title_snapshot IS DISTINCT FROM NEW.invoice_title_snapshot
    OR OLD.email_subject_template_snapshot IS DISTINCT FROM NEW.email_subject_template_snapshot
    OR OLD.email_intro_template_snapshot IS DISTINCT FROM NEW.email_intro_template_snapshot
    OR OLD.footer_note_snapshot IS DISTINCT FROM NEW.footer_note_snapshot
    OR OLD.bank_account_name_snapshot IS DISTINCT FROM NEW.bank_account_name_snapshot
    OR OLD.bank_name_snapshot IS DISTINCT FROM NEW.bank_name_snapshot
    OR OLD.bank_bsb_snapshot IS DISTINCT FROM NEW.bank_bsb_snapshot
    OR OLD.bank_account_number_snapshot IS DISTINCT FROM NEW.bank_account_number_snapshot
    OR OLD.payment_reference_template_snapshot IS DISTINCT FROM NEW.payment_reference_template_snapshot
    OR OLD.issued_by_staff_id IS DISTINCT FROM NEW.issued_by_staff_id
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
  THEN
    RAISE EXCEPTION 'Issued invoice snapshots are immutable.';
  END IF;

  IF (
    OLD.sender_name_snapshot IS DISTINCT FROM NEW.sender_name_snapshot
    OR OLD.sender_title_snapshot IS DISTINCT FROM NEW.sender_title_snapshot
    OR OLD.sender_email_snapshot IS DISTINCT FROM NEW.sender_email_snapshot
  ) AND (
    OLD.delivery_status NOT IN ('pending', 'failed')
    OR OLD.provider_message_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The invoice sender is immutable after its first delivery.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE contract_sale_invoice_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE contract_sale_invoice_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE contract_sale_invoice_email_deliveries TO service_role;
REVOKE ALL ON FUNCTION protect_contract_sale_invoice_email_delivery() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE contract_sale_invoice_email_deliveries IS
  'Immutable content snapshot and provider outcome for each contract-sale invoice email attempt.';

COMMIT;
