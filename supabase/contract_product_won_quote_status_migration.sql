-- Secure Cleaning - keep the winning quote aligned with an atomic opportunity win.
-- Apply after contract_product_uuid_generation_post_monthly_fix_migration.sql.

CREATE OR REPLACE FUNCTION sync_winning_quote_accepted_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  winning_quote_ref TEXT;
  linked_product_id UUID;
BEGIN
  IF NEW.stage = 'won'
     AND NEW.winning_quote_id IS NOT NULL
     AND (
       OLD.stage IS DISTINCT FROM NEW.stage
       OR OLD.winning_quote_id IS DISTINCT FROM NEW.winning_quote_id
     ) THEN
    SELECT id INTO linked_product_id
    FROM contract_products
    WHERE opportunity_id = NEW.id
      AND source_quote_id = NEW.winning_quote_id;

    IF linked_product_id IS NULL THEN
      RAISE EXCEPTION 'winning quote requires its linked contract product'
        USING ERRCODE = '23514';
    END IF;

    UPDATE quotes SET
      status = 'accepted',
      follow_up_status = 'won',
      firm_quote_workflow = jsonb_set(
        COALESCE(firm_quote_workflow, '{}'::JSONB),
        '{status}',
        '"accepted"'::JSONB,
        TRUE
      ),
      updated_at = NOW()
    WHERE id = NEW.winning_quote_id
      AND (
        status IS DISTINCT FROM 'accepted'
        OR follow_up_status IS DISTINCT FROM 'won'
        OR COALESCE(firm_quote_workflow->>'status', '') <> 'accepted'
      )
    RETURNING quote_ref INTO winning_quote_ref;

    IF winning_quote_ref IS NOT NULL THEN
      INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
      VALUES (
        'quote',
        winning_quote_ref,
        'quote.accepted_from_won_opportunity',
        jsonb_build_object(
          'opportunityId', NEW.id,
          'productId', linked_product_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_winning_quote_accepted_status ON crm_opportunities;
CREATE TRIGGER trg_sync_winning_quote_accepted_status
AFTER UPDATE OF stage, winning_quote_id ON crm_opportunities
FOR EACH ROW EXECUTE FUNCTION sync_winning_quote_accepted_status();

REVOKE ALL ON FUNCTION sync_winning_quote_accepted_status()
FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  repaired RECORD;
BEGIN
  FOR repaired IN
    UPDATE quotes AS q SET
      status = 'accepted',
      follow_up_status = 'won',
      firm_quote_workflow = jsonb_set(
        COALESCE(q.firm_quote_workflow, '{}'::JSONB),
        '{status}',
        '"accepted"'::JSONB,
        TRUE
      ),
      updated_at = NOW()
    FROM crm_opportunities AS o
    JOIN contract_products AS p
      ON p.opportunity_id = o.id
     AND p.source_quote_id = o.winning_quote_id
    WHERE o.stage = 'won'
      AND q.id = o.winning_quote_id
      AND (
        q.status IS DISTINCT FROM 'accepted'
        OR q.follow_up_status IS DISTINCT FROM 'won'
        OR COALESCE(q.firm_quote_workflow->>'status', '') <> 'accepted'
      )
    RETURNING q.quote_ref, o.id AS opportunity_id, p.id AS product_id
  LOOP
    INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
    VALUES (
      'quote',
      repaired.quote_ref,
      'quote.accepted_from_won_opportunity_backfill',
      jsonb_build_object(
        'opportunityId', repaired.opportunity_id,
        'productId', repaired.product_id
      )
    );
  END LOOP;
END;
$$;
