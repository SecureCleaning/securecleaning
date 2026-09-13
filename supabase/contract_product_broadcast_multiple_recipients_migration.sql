BEGIN;

DO $$
DECLARE
  recipient_mode_constraint TEXT;
BEGIN
  FOR recipient_mode_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.cleaner_broadcast_campaigns'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%recipient_mode%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.cleaner_broadcast_campaigns DROP CONSTRAINT %I',
      recipient_mode_constraint
    );
  END LOOP;
END $$;

ALTER TABLE cleaner_broadcast_campaigns
  ADD CONSTRAINT cleaner_broadcast_campaigns_recipient_mode_check
  CHECK (recipient_mode IN ('state', 'single', 'multiple'));

ALTER TABLE cleaner_broadcast_campaigns
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT;

UPDATE cleaner_broadcast_campaigns
SET created_by_staff_id = sender_staff_id
WHERE created_by_staff_id IS NULL;

ALTER TABLE cleaner_broadcast_campaigns
  ALTER COLUMN created_by_staff_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cleaner_broadcast_campaigns_created_by
  ON cleaner_broadcast_campaigns(created_by_staff_id, created_at DESC);

CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_campaign(
  p_campaign_id UUID,
  p_runner_token UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cleaner_broadcast_campaigns
  SET runner_token = p_runner_token, lease_expires_at = NOW() + INTERVAL '15 minutes'
  WHERE id = p_campaign_id
    AND created_by_staff_id = p_actor_id
    AND status = 'sending'
    AND (p_actor_role <> 'agent' OR state = p_actor_state)
    AND (runner_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= NOW()
      OR runner_token = p_runner_token);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_recipient(
  p_campaign_id UUID,
  p_recipient_id UUID,
  p_runner_token UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  campaign_row cleaner_broadcast_campaigns%ROWTYPE;
  recipient_row cleaner_broadcast_recipients%ROWTYPE;
  eligible BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO campaign_row FROM cleaner_broadcast_campaigns
  WHERE id = p_campaign_id FOR UPDATE;
  IF campaign_row.id IS NULL OR campaign_row.created_by_staff_id IS DISTINCT FROM p_actor_id
     OR campaign_row.status <> 'sending'
     OR campaign_row.runner_token IS DISTINCT FROM p_runner_token
     OR campaign_row.lease_expires_at IS NULL
     OR campaign_row.lease_expires_at <= NOW() THEN RETURN FALSE; END IF;
  IF p_actor_role = 'agent' AND campaign_row.state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'broadcast state is outside agent region' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO recipient_row FROM cleaner_broadcast_recipients
  WHERE id = p_recipient_id AND campaign_id = p_campaign_id FOR UPDATE;
  IF recipient_row.id IS NULL OR recipient_row.status <> 'queued' THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM cleaners c
    WHERE c.id = recipient_row.cleaner_id
      AND c.status = 'approved'
      AND c.state = campaign_row.state
      AND LOWER(BTRIM(c.email)) = LOWER(BTRIM(recipient_row.to_email))
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
  ) AND EXISTS (
    SELECT 1 FROM cleaner_broadcast_campaign_products cp
    JOIN contract_products p ON p.id = cp.product_id
    WHERE cp.campaign_id = p_campaign_id
  ) AND NOT EXISTS (
    SELECT 1 FROM cleaner_broadcast_campaign_products cp
    JOIN contract_products p ON p.id = cp.product_id
    WHERE cp.campaign_id = p_campaign_id
      AND (p.status <> 'available' OR p.state <> campaign_row.state)
  ) INTO eligible;

  IF NOT eligible THEN
    UPDATE cleaner_broadcast_recipients SET status = 'skipped', failure_code = 'eligibility_changed'
    WHERE id = p_recipient_id;
    RETURN FALSE;
  END IF;
  UPDATE cleaner_broadcast_recipients SET status = 'sending', failure_code = NULL
  WHERE id = p_recipient_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION create_cleaner_broadcast_campaign_v3(
  p_idempotency_key UUID,
  p_state TEXT,
  p_subject TEXT,
  p_intro TEXT,
  p_product_ids UUID[],
  p_product_snapshots JSONB,
  p_recipient_mode TEXT,
  p_target_cleaner_id UUID,
  p_recipient_cleaner_ids UUID[],
  p_sender_staff_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
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
  sender_name TEXT;
  sender_email TEXT;
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
  SELECT display_name, email INTO sender_name, sender_email
  FROM admin_staff_accounts
  WHERE id = p_sender_staff_id AND active = TRUE AND role::TEXT IN ('owner', 'manager', 'agent');
  IF sender_name IS NULL OR sender_email IS NULL
     OR (p_actor_role <> 'owner' AND p_sender_staff_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'broadcast sender is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_mode NOT IN ('state', 'single', 'multiple')
     OR (p_recipient_mode = 'single' AND p_target_cleaner_id IS NULL)
     OR (p_recipient_mode IN ('state', 'multiple') AND p_target_cleaner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'broadcast recipient selection is invalid' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(BTRIM(p_subject), '') IS NULL OR NULLIF(BTRIM(p_intro), '') IS NULL THEN
    RAISE EXCEPTION 'broadcast content is required' USING ERRCODE = '23514';
  END IF;

  expected_recipients := COALESCE(array_length(p_recipient_cleaner_ids, 1), 0);
  IF expected_recipients = 0 OR expected_recipients > 50
     OR (SELECT COUNT(DISTINCT id) FROM unnest(p_recipient_cleaner_ids) AS selected(id)) <> expected_recipients
     OR (p_recipient_mode = 'single' AND (expected_recipients <> 1 OR p_target_cleaner_id <> p_recipient_cleaner_ids[1]))
     OR (p_recipient_mode = 'multiple' AND expected_recipients < 2) THEN
    RAISE EXCEPTION 'broadcast recipient selection is outside the safe limit' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF claimed_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaigns
      WHERE id = claimed_campaign_id AND created_by_staff_id = p_actor_id
        AND sender_staff_id = p_sender_staff_id AND state = p_state
        AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro)
        AND recipient_mode = p_recipient_mode
        AND target_cleaner_id IS NOT DISTINCT FROM p_target_cleaner_id
    ) OR (SELECT COUNT(*) FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id) <> COALESCE(array_length(p_product_ids, 1), 0)
    OR EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id AND product_id <> ALL(p_product_ids)
    ) OR (SELECT COUNT(*) FROM cleaner_broadcast_recipients
      WHERE campaign_id = claimed_campaign_id) <> expected_recipients
    OR EXISTS (
      SELECT 1 FROM cleaner_broadcast_recipients
      WHERE campaign_id = claimed_campaign_id AND cleaner_id <> ALL(p_recipient_cleaner_ids)
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
    idempotency_key, state, subject_snapshot, intro_snapshot, sender_staff_id, created_by_staff_id,
    sender_name_snapshot, sender_email_snapshot, recipient_count, recipient_mode, target_cleaner_id
  ) VALUES (
    p_idempotency_key, p_state, BTRIM(p_subject), BTRIM(p_intro), p_sender_staff_id, p_actor_id,
    BTRIM(sender_name), LOWER(BTRIM(sender_email)), eligible_count, p_recipient_mode, p_target_cleaner_id
  ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO claimed_campaign_id;
  IF claimed_campaign_id IS NULL THEN
    SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
    WHERE idempotency_key = p_idempotency_key AND created_by_staff_id = p_actor_id
      AND sender_staff_id = p_sender_staff_id AND state = p_state
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

REVOKE ALL ON FUNCTION create_cleaner_broadcast_campaign_v3(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, TEXT, UUID, UUID[], UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_cleaner_broadcast_campaign_v3(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, TEXT, UUID, UUID[], UUID, UUID, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION claim_cleaner_broadcast_campaign(UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_cleaner_broadcast_campaign(UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION claim_cleaner_broadcast_recipient(UUID, UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_cleaner_broadcast_recipient(UUID, UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
