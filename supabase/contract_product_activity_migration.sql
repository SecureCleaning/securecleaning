-- Preserve each product-interest submission as private product activity.
-- Apply after contract_products_interest_notifications_migration.sql.

CREATE TABLE IF NOT EXISTS contract_product_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES contract_products(id) ON DELETE CASCADE,
  interest_id UUID REFERENCES contract_product_interests(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('interest_registered')),
  contact_name TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  match_status TEXT NOT NULL CHECK (match_status IN ('approved_cleaner', 'unmatched')),
  interest_status TEXT NOT NULL DEFAULT 'new'
    CHECK (interest_status IN ('new', 'contacted', 'shortlisted', 'declined', 'selected')),
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sending', 'sent', 'failed', 'unknown')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_product_activity_product
  ON contract_product_activity(product_id, occurred_at DESC);

ALTER TABLE contract_product_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE contract_product_activity FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE contract_product_activity TO service_role;

CREATE OR REPLACE FUNCTION sync_contract_product_activity_interest_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE contract_product_activity
    SET interest_status = NEW.status
    WHERE interest_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_product_activity_interest_status ON contract_product_interests;
CREATE TRIGGER trg_contract_product_activity_interest_status
  AFTER UPDATE OF status ON contract_product_interests
  FOR EACH ROW EXECUTE FUNCTION sync_contract_product_activity_interest_status();

REVOKE ALL ON FUNCTION sync_contract_product_activity_interest_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_contract_product_activity_interest_status() TO service_role;

INSERT INTO contract_product_activity(
  product_id, interest_id, event_type, contact_name, email_normalized, phone, note,
  match_status, interest_status, notification_status, occurred_at
)
SELECT
  interest.product_id,
  interest.id,
  'interest_registered',
  interest.contact_name,
  interest.email_normalized,
  interest.phone,
  interest.note,
  interest.match_status,
  interest.status,
  COALESCE(notification.status, 'pending'),
  COALESCE(interest.last_submitted_at, interest.created_at)
FROM contract_product_interests interest
LEFT JOIN contract_product_interest_notifications notification
  ON notification.interest_id = interest.id AND notification.audience = 'agent'
WHERE NOT EXISTS (
  SELECT 1 FROM contract_product_activity activity WHERE activity.interest_id = interest.id
);
