-- Private, reusable PDF attachments for versioned Client CRM email templates.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-template-attachments',
  'crm-template-attachments',
  FALSE,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.crm_email_template_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 160),
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'application/pdf' CHECK (content_type = 'application/pdf'),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'archived')),
  uploaded_by_staff_id UUID NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_email_template_documents_status
  ON public.crm_email_template_documents(status, created_at DESC);

CREATE TRIGGER trg_crm_email_template_documents_updated_at
  BEFORE UPDATE ON public.crm_email_template_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.crm_email_template_version_documents (
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  document_id UUID NOT NULL REFERENCES public.crm_email_template_documents(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (template_id, template_version, document_id),
  UNIQUE (template_id, template_version, position),
  FOREIGN KEY (template_id, template_version)
    REFERENCES public.crm_email_template_versions(template_id, version)
    ON DELETE CASCADE
);

ALTER TABLE public.crm_communications
  ADD COLUMN IF NOT EXISTS attachment_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.crm_communications
  DROP CONSTRAINT IF EXISTS crm_communications_attachment_snapshot_array;
ALTER TABLE public.crm_communications
  ADD CONSTRAINT crm_communications_attachment_snapshot_array
  CHECK (jsonb_typeof(attachment_snapshot) = 'array');

CREATE OR REPLACE FUNCTION public.save_client_crm_template_with_documents(
  p_template_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_category TEXT,
  p_visibility TEXT,
  p_status TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_document_ids UUID[] DEFAULT ARRAY[]::UUID[]
) RETURNS TABLE(template_id UUID, template_version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved RECORD;
  requested_count INTEGER;
  active_count INTEGER;
  requested_bytes BIGINT;
BEGIN
  requested_count := COALESCE(cardinality(p_document_ids), 0);
  IF requested_count > 3 THEN
    RAISE EXCEPTION 'A template can include at most three documents.';
  END IF;
  IF requested_count <> COALESCE((SELECT COUNT(DISTINCT document_id) FROM unnest(p_document_ids) AS selected(document_id)), 0) THEN
    RAISE EXCEPTION 'Template documents must be unique.';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(size_bytes), 0)
    INTO active_count, requested_bytes
  FROM public.crm_email_template_documents
  WHERE id = ANY(COALESCE(p_document_ids, ARRAY[]::UUID[]))
    AND status = 'active'
    AND sha256 IS NOT NULL;

  IF active_count <> requested_count THEN
    RAISE EXCEPTION 'One or more template documents are unavailable.';
  END IF;
  IF requested_bytes > 20971520 THEN
    RAISE EXCEPTION 'Template documents must total 20 MB or less.';
  END IF;

  SELECT * INTO saved
  FROM public.save_client_crm_template(
    p_template_id,
    p_name,
    p_description,
    p_category,
    p_visibility,
    p_status,
    p_subject,
    p_body,
    p_actor_id,
    p_actor_role
  );

  INSERT INTO public.crm_email_template_version_documents(
    template_id, template_version, document_id, position
  )
  SELECT saved.template_id, saved.template_version, document_id, (ordinality - 1)::SMALLINT
  FROM unnest(COALESCE(p_document_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS selected(document_id, ordinality);

  RETURN QUERY SELECT saved.template_id, saved.template_version;
END;
$$;

ALTER TABLE public.crm_email_template_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_template_version_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_email_template_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_email_template_version_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_email_template_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_email_template_version_documents TO service_role;

REVOKE ALL ON FUNCTION public.save_client_crm_template_with_documents(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_crm_template_with_documents(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID[]
) TO service_role;

COMMENT ON TABLE public.crm_email_template_documents IS
  'Private, immutable PDF library for Client CRM template attachments. Objects remain private and are read only by trusted server code.';
COMMENT ON TABLE public.crm_email_template_version_documents IS
  'Ordered attachment selection captured for each immutable Client CRM template version.';
COMMENT ON COLUMN public.crm_communications.attachment_snapshot IS
  'Immutable metadata for the quote and template documents included with the provider send.';
