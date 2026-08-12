-- Secure Cleaning - Cleaner document uploads

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cleaner-documents',
  'cleaner-documents',
  FALSE,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

CREATE TABLE IF NOT EXISTS cleaner_documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id     UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  document_type  TEXT NOT NULL DEFAULT 'other'
                   CHECK (document_type IN ('insurance', 'police_check', 'induction', 'contract', 'other')),
  file_name      TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  content_type   TEXT,
  size_bytes     INTEGER,
  expiry_date    DATE,
  notes          TEXT,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaner_documents_storage_path ON cleaner_documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_cleaner_documents_cleaner_id ON cleaner_documents(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_documents_type ON cleaner_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_cleaner_documents_expiry ON cleaner_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_cleaner_documents_created_at ON cleaner_documents(created_at DESC);

ALTER TABLE cleaner_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cleaner_documents' AND policyname = 'Service role full access — cleaner_documents'
  ) THEN
    CREATE POLICY "Service role full access — cleaner_documents"
      ON cleaner_documents FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Service role full access — cleaner document objects'
  ) THEN
    CREATE POLICY "Service role full access — cleaner document objects"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'cleaner-documents')
      WITH CHECK (bucket_id = 'cleaner-documents');
  END IF;
END $$;
