-- Cover document ownership and attachment references for FK checks and lookups.
CREATE INDEX IF NOT EXISTS idx_crm_email_template_documents_uploader
  ON public.crm_email_template_documents(uploaded_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_template_version_documents_document
  ON public.crm_email_template_version_documents(document_id);
