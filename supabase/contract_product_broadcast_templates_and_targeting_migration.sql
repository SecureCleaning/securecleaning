BEGIN;

CREATE TABLE IF NOT EXISTS cleaner_broadcast_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 80),
  subject TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(subject)) BETWEEN 1 AND 240),
  message TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  updated_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaner_broadcast_templates_active_name
  ON cleaner_broadcast_templates(LOWER(name)) WHERE status = 'active';

INSERT INTO cleaner_broadcast_templates(name, subject, message)
SELECT
  'Available contracts',
  'Available cleaning contracts in your area',
  'We have new Secure Cleaning contract opportunities available in your area. Review the current jobs below and use the available-jobs link for full details.'
WHERE NOT EXISTS (
  SELECT 1 FROM cleaner_broadcast_templates WHERE status = 'active'
);

ALTER TABLE cleaner_broadcast_campaigns
  ADD COLUMN IF NOT EXISTS recipient_mode TEXT NOT NULL DEFAULT 'state'
    CHECK (recipient_mode IN ('state', 'single')),
  ADD COLUMN IF NOT EXISTS target_cleaner_id UUID REFERENCES cleaners(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION create_cleaner_broadcast_campaign_v2(
  p_idempotency_key UUID,
  p_state TEXT,
  p_subject TEXT,
  p_intro TEXT,
  p_product_ids UUID[],
  p_product_snapshots JSONB,
  p_recipient_mode TEXT,
  p_target_cleaner_id UUID,
  p_recipient_cleaner_ids UUID[],
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT,
  p_actor_name TEXT,
  p_actor_email TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_campaign_id UUID;
  eligible_count INTEGER;
  expected_products INTEGER;
  expected_recipients INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')
     OR (p_actor_role = 'agent' AND p_state IS DISTINCT FROM p_actor_state) THEN
    RAISE EXCEPTION 'broadcast state is outside agent region' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_mode NOT IN ('state', 'single')
     OR (p_recipient_mode = 'single' AND p_target_cleaner_id IS NULL)
     OR (p_recipient_mode = 'state' AND p_target_cleaner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'broadcast recipient selection is invalid' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(BTRIM(p_subject), '') IS NULL OR NULLIF(BTRIM(p_intro), '') IS NULL THEN
    RAISE EXCEPTION 'broadcast content is required' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF claimed_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaigns
      WHERE id = claimed_campaign_id AND sender_staff_id = p_actor_id AND state = p_state
        AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro)
        AND recipient_mode = p_recipient_mode
        AND target_cleaner_id IS NOT DISTINCT FROM p_target_cleaner_id
    ) OR (SELECT COUNT(*) FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id) <> COALESCE(array_length(p_product_ids, 1), 0)
    OR EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id AND product_id <> ALL(p_product_ids)
    ) THEN RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505'; END IF;
    RETURN claimed_campaign_id;
  END IF;

  expected_products := COALESCE(array_length(p_product_ids, 1), 0);
  IF expected_products = 0 OR jsonb_typeof(p_product_snapshots) <> 'array'
     OR jsonb_array_length(p_product_snapshots) <> expected_products
     OR (SELECT COUNT(DISTINCT id) FROM contract_products WHERE id = ANY(p_product_ids)
       AND status = 'available' AND state = p_state
       AND (p_actor_role <> 'agent' OR assigned_staff_id = p_actor_id)) <> expected_products THEN
    RAISE EXCEPTION 'one or more products are unavailable or outside the actor region' USING ERRCODE = '23514';
  END IF;

  expected_recipients := COALESCE(array_length(p_recipient_cleaner_ids, 1), 0);
  IF expected_recipients = 0 OR expected_recipients > 50
     OR (SELECT COUNT(DISTINCT id) FROM unnest(p_recipient_cleaner_ids) AS selected(id)) <> expected_recipients
     OR (p_recipient_mode = 'single' AND (expected_recipients <> 1 OR p_target_cleaner_id <> p_recipient_cleaner_ids[1])) THEN
    RAISE EXCEPTION 'broadcast recipient selection is outside the safe limit' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO eligible_count FROM (
    SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id
    FROM cleaners c
    WHERE c.id = ANY(p_recipient_cleaner_ids)
      AND c.status = 'approved' AND c.state = p_state
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
    ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
  ) eligible;
  IF eligible_count <> expected_recipients THEN
    RAISE EXCEPTION 'one or more selected cleaners are not eligible' USING ERRCODE = '23514';
  END IF;

  INSERT INTO cleaner_broadcast_campaigns(
    idempotency_key, state, subject_snapshot, intro_snapshot, sender_staff_id,
    sender_name_snapshot, sender_email_snapshot, recipient_count, recipient_mode, target_cleaner_id
  ) VALUES (
    p_idempotency_key, p_state, BTRIM(p_subject), BTRIM(p_intro), p_actor_id,
    BTRIM(p_actor_name), LOWER(BTRIM(p_actor_email)), eligible_count, p_recipient_mode, p_target_cleaner_id
  ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO claimed_campaign_id;
  IF claimed_campaign_id IS NULL THEN
    SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
    WHERE idempotency_key = p_idempotency_key AND sender_staff_id = p_actor_id AND state = p_state
      AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro)
      AND recipient_mode = p_recipient_mode
      AND target_cleaner_id IS NOT DISTINCT FROM p_target_cleaner_id;
    IF claimed_campaign_id IS NULL THEN
      RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505';
    END IF;
    RETURN claimed_campaign_id;
  END IF;

  INSERT INTO cleaner_broadcast_campaign_products(campaign_id, product_id, product_snapshot)
  SELECT claimed_campaign_id, product.id, snapshot.value
  FROM jsonb_array_elements(p_product_snapshots) snapshot(value)
  JOIN contract_products product ON product.id = (snapshot.value->>'id')::UUID
  WHERE product.id = ANY(p_product_ids);

  INSERT INTO cleaner_broadcast_recipients(campaign_id, cleaner_id, to_email, cleaner_name_snapshot)
  SELECT claimed_campaign_id, eligible.id, LOWER(BTRIM(eligible.email)),
    COALESCE(NULLIF(BTRIM(eligible.contact_name), ''), 'Cleaner')
  FROM (
    SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id, c.email, c.contact_name
    FROM cleaners c
    WHERE c.id = ANY(p_recipient_cleaner_ids)
      AND c.status = 'approved' AND c.state = p_state
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
    ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
  ) eligible;
  RETURN claimed_campaign_id;
END;
$$;

ALTER TABLE cleaner_broadcast_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cleaner_broadcast_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE cleaner_broadcast_templates TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'cleaner_broadcast_templates'
      AND policyname = 'Service role full access - cleaner_broadcast_templates'
  ) THEN
    CREATE POLICY "Service role full access - cleaner_broadcast_templates"
      ON cleaner_broadcast_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleaner_broadcast_templates_updated_at') THEN
    CREATE TRIGGER trg_cleaner_broadcast_templates_updated_at
      BEFORE UPDATE ON cleaner_broadcast_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

REVOKE ALL ON FUNCTION create_cleaner_broadcast_campaign_v2(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, TEXT, UUID, UUID[], UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_cleaner_broadcast_campaign_v2(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, TEXT, UUID, UUID[], UUID, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
