-- Persist every valid product-interest submission and track its email deliveries.
-- Apply after contract_products_migration.sql.

ALTER TABLE contract_product_interests
  ALTER COLUMN cleaner_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS match_status TEXT NOT NULL DEFAULT 'approved_cleaner'
    CHECK (match_status IN ('approved_cleaner', 'unmatched')),
  ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_product_interests_product_email
  ON contract_product_interests(product_id, email_normalized);

CREATE TABLE IF NOT EXISTS contract_product_interest_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interest_id UUID NOT NULL REFERENCES contract_product_interests(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('cleaner', 'agent')),
  recipient_email TEXT NOT NULL,
  notified_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown')),
  provider_message_id TEXT,
  failure_message TEXT,
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interest_id, audience)
);

CREATE INDEX IF NOT EXISTS idx_contract_product_interest_notifications_status
  ON contract_product_interest_notifications(status, attempted_at);

ALTER TABLE contract_product_interest_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE contract_product_interest_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE contract_product_interest_notifications TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contract_product_interest_notifications_updated_at'
  ) THEN
    CREATE TRIGGER trg_contract_product_interest_notifications_updated_at
      BEFORE UPDATE ON contract_product_interest_notifications
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
