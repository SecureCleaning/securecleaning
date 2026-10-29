BEGIN;

-- Historical reference, deliberately not a foreign key: CRM deletion archives and
-- removes messages, and must not be blocked by email-history relationships.
ALTER TABLE public.crm_communications ADD COLUMN IF NOT EXISTS follow_up_to_id UUID;

CREATE OR REPLACE FUNCTION public.guard_crm_email_follow_up()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.follow_up_to_id IS DISTINCT FROM OLD.follow_up_to_id
     AND (OLD.follow_up_to_id IS NOT NULL OR OLD.status <> 'sending') THEN
    RAISE EXCEPTION 'The original email reference cannot be changed after preparation';
  END IF;
  IF NEW.follow_up_to_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.follow_up_to_id IS DISTINCT FROM OLD.follow_up_to_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_communications original
      WHERE original.id = NEW.follow_up_to_id AND original.id <> NEW.id
        AND original.opportunity_id = NEW.opportunity_id
        AND original.contact_id = NEW.contact_id
        AND lower(btrim(original.to_email)) = lower(btrim(NEW.to_email))
        AND original.status = 'sent' AND original.sent_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Follow-up must reference a sent email for the same opportunity, contact and recipient';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_crm_email_follow_up() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_crm_email_follow_up() TO service_role;
DROP TRIGGER IF EXISTS guard_crm_email_follow_up ON public.crm_communications;
CREATE TRIGGER guard_crm_email_follow_up BEFORE INSERT OR UPDATE ON public.crm_communications
FOR EACH ROW EXECUTE FUNCTION public.guard_crm_email_follow_up();

INSERT INTO public.crm_email_templates
  (id, name, description, category, purpose, visibility, status, is_system, subject, body)
VALUES ('bd790bc4-7b27-4c60-a348-2050b9f85702', 'Did you receive my email?',
  'Used by Follow up in email Activity. The selected earlier email is included automatically; its subject is retained.',
  'follow_up', 'marketing', 'shared', 'published', TRUE, 'Following up - <<business_name>>',
  E'Hi <<first_name>>,\n\nI am following up on my earlier email below. Did you receive it?\n\nPlease let me know if you have any questions or would like to discuss your cleaning requirements. I would be happy to help.')
ON CONFLICT DO NOTHING;
INSERT INTO public.crm_email_template_versions (template_id, version, subject, body, purpose)
SELECT id, current_version, subject, body, purpose FROM public.crm_email_templates
WHERE id = 'bd790bc4-7b27-4c60-a348-2050b9f85702'
ON CONFLICT (template_id, version) DO NOTHING;

COMMIT;
