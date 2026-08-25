-- Allow owner/manager CRM users to send as an active CRM-capable team member,
-- keep regional agents restricted to themselves, and update current brand copy.

DROP FUNCTION IF EXISTS public.claim_client_crm_communication(
  UUID, UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT, TEXT,
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.claim_client_crm_communication(
  p_opportunity_id UUID,
  p_actor_id UUID,
  p_organisation_id UUID,
  p_contact_id UUID,
  p_template_id UUID,
  p_template_version INTEGER,
  p_purpose TEXT,
  p_idempotency_key UUID,
  p_to_email TEXT,
  p_from_email TEXT,
  p_reply_to_email TEXT,
  p_sender_staff_id UUID,
  p_sender_name TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_signature TEXT,
  p_source TEXT,
  p_footer TEXT,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  actor_account admin_staff_accounts%ROWTYPE;
  sender_account admin_staff_accounts%ROWTYPE;
  contact_email TEXT;
  communication_id UUID;
BEGIN
  SELECT * INTO actor_account
  FROM admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE AND role = p_actor_role;
  IF actor_account.id IS NULL OR p_actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'communication access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO sender_account
  FROM admin_staff_accounts
  WHERE id = p_sender_staff_id
    AND active = TRUE
    AND role IN ('owner', 'manager', 'agent');
  IF sender_account.id IS NULL THEN
    RAISE EXCEPTION 'sender access denied' USING ERRCODE = '42501';
  END IF;
  IF LOWER(BTRIM(sender_account.email)) <> LOWER(BTRIM(p_reply_to_email))
    OR sender_account.display_name <> p_sender_name THEN
    RAISE EXCEPTION 'sender identity mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO opportunity_row
  FROM crm_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;
  IF opportunity_row.id IS NULL
    OR opportunity_row.organisation_id <> p_organisation_id
    OR opportunity_row.primary_contact_id <> p_contact_id THEN
    RAISE EXCEPTION 'opportunity identity mismatch' USING ERRCODE = '23514';
  END IF;
  IF p_actor_role = 'agent'
    AND (
      opportunity_row.assigned_staff_id IS DISTINCT FROM p_actor_id
      OR p_sender_staff_id IS DISTINCT FROM p_actor_id
    ) THEN
    RAISE EXCEPTION 'communication access denied' USING ERRCODE = '42501';
  END IF;
  IF p_purpose <> 'marketing' THEN
    RAISE EXCEPTION 'unsupported communication purpose' USING ERRCODE = '23514';
  END IF;

  SELECT LOWER(BTRIM(email)) INTO contact_email
  FROM clients
  WHERE id = p_contact_id AND organisation_id = p_organisation_id;
  IF contact_email IS NULL OR contact_email <> LOWER(BTRIM(p_to_email)) THEN
    RAISE EXCEPTION 'recipient identity mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM crm_email_suppressions
    WHERE email_normalized = contact_email
  ) THEN
    RAISE EXCEPTION 'recipient is suppressed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO crm_communications(
    opportunity_id, organisation_id, contact_id, template_id, template_version,
    purpose, idempotency_key, to_email, from_email, reply_to_email,
    sender_staff_id, sender_name, subject_snapshot, body_snapshot,
    signature_snapshot, source_snapshot, footer_snapshot, status
  ) VALUES (
    p_opportunity_id, p_organisation_id, p_contact_id, p_template_id, p_template_version,
    p_purpose, p_idempotency_key, contact_email, p_from_email, p_reply_to_email,
    p_sender_staff_id, p_sender_name, p_subject, p_body,
    p_signature, p_source, p_footer, 'sending'
  ) RETURNING id INTO communication_id;
  RETURN communication_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_crm_communication(
  UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT,
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_crm_communication(
  UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT,
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

UPDATE site_content
SET content = REPLACE(content, 'Secure Cleaning Aus', 'Secure Cleaning')
WHERE POSITION('Secure Cleaning Aus' IN content) > 0;

UPDATE leads
SET source_explanation = REPLACE(source_explanation, 'Secure Cleaning Aus', 'Secure Cleaning')
WHERE POSITION('Secure Cleaning Aus' IN COALESCE(source_explanation, '')) > 0;

WITH changed_templates AS (
  UPDATE crm_email_templates
  SET subject = REPLACE(subject, 'Secure Cleaning Aus', 'Secure Cleaning'),
      body = REPLACE(body, 'Secure Cleaning Aus', 'Secure Cleaning'),
      current_version = current_version + 1,
      updated_at = NOW()
  WHERE POSITION('Secure Cleaning Aus' IN subject) > 0
     OR POSITION('Secure Cleaning Aus' IN body) > 0
  RETURNING id, current_version, subject, body, purpose, updated_by_staff_id
)
INSERT INTO crm_email_template_versions(
  template_id, version, subject, body, purpose, changed_by_staff_id
)
SELECT id, current_version, subject, body, purpose, updated_by_staff_id
FROM changed_templates
ON CONFLICT (template_id, version) DO NOTHING;
