BEGIN;
ALTER TABLE crm_email_templates ADD COLUMN IF NOT EXISTS follow_up_days integer CHECK (follow_up_days BETWEEN 1 AND 60);
ALTER TABLE crm_email_templates ADD COLUMN IF NOT EXISTS follow_up_note text;
ALTER TABLE crm_email_template_versions ADD COLUMN IF NOT EXISTS follow_up_days integer CHECK (follow_up_days BETWEEN 1 AND 60);
ALTER TABLE crm_email_template_versions ADD COLUMN IF NOT EXISTS follow_up_note text;
ALTER TABLE crm_communications ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE crm_communications ADD COLUMN IF NOT EXISTS follow_up_note text;

-- Finalisation and reminder creation share one transaction. Retries do not
-- recreate reminders, and existing earlier follow-ups always take priority.
CREATE OR REPLACE FUNCTION apply_crm_email_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' AND NEW.follow_up_at IS NOT NULL THEN
    UPDATE crm_opportunities SET
      next_follow_up_at = NEW.follow_up_at,
      notes = concat_ws(E'\n', NULLIF(notes, ''), 'Email follow-up: ' || COALESCE(NULLIF(NEW.follow_up_note, ''), 'Follow up outreach email'))
    WHERE id = NEW.opportunity_id
      AND stage NOT IN ('won', 'lost', 'cancelled')
      AND (next_follow_up_at IS NULL OR next_follow_up_at > NEW.follow_up_at);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION apply_crm_email_follow_up() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS crm_email_follow_up ON crm_communications;
CREATE TRIGGER crm_email_follow_up AFTER UPDATE OF status ON crm_communications
FOR EACH ROW EXECUTE FUNCTION apply_crm_email_follow_up();
-- Retain reminder changes in the existing private audit trail, including clears.
CREATE OR REPLACE FUNCTION audit_crm_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.next_follow_up_at IS DISTINCT FROM NEW.next_follow_up_at THEN
    INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
    VALUES ('crm_opportunity', NEW.id::text, 'crm.follow_up.changed',
      jsonb_build_object('previousDueAt', OLD.next_follow_up_at, 'dueAt', NEW.next_follow_up_at, 'assignedStaffId', NEW.assigned_staff_id));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION audit_crm_follow_up() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS crm_follow_up_audit ON crm_opportunities;
CREATE TRIGGER crm_follow_up_audit AFTER UPDATE OF next_follow_up_at ON crm_opportunities
FOR EACH ROW EXECUTE FUNCTION audit_crm_follow_up();
COMMIT;
