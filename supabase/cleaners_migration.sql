-- Secure Cleaning - Cleaner database / admin CRM

CREATE TABLE IF NOT EXISTS cleaners (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name        TEXT NOT NULL,
  first_name           TEXT,
  last_name            TEXT,
  contact_name         TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  alternate_phone      TEXT,
  address              TEXT,
  suburb               TEXT,
  postcode             TEXT,
  city                 TEXT,
  state                TEXT,
  abn                  TEXT,
  status               TEXT NOT NULL DEFAULT 'lead'
                         CHECK (status IN ('lead', 'pending_approval', 'approved', 'paused', 'rejected', 'inactive')),
  services             TEXT[] NOT NULL DEFAULT '{}',
  service_areas        TEXT[] NOT NULL DEFAULT '{}',
  preferred_work       TEXT,
  compliance_status    TEXT,
  insurance_expiry     DATE,
  police_check_expiry  DATE,
  induction_expiry     DATE,
  working_with_children_check BOOLEAN NOT NULL DEFAULT FALSE,
  internal_owner       TEXT,
  rating               NUMERIC(3,2),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaners_email_unique ON cleaners (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_cleaners_status ON cleaners(status);
CREATE INDEX IF NOT EXISTS idx_cleaners_city ON cleaners(city);
CREATE INDEX IF NOT EXISTS idx_cleaners_updated_at ON cleaners(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleaners_services ON cleaners USING GIN(services);
CREATE INDEX IF NOT EXISTS idx_cleaners_service_areas ON cleaners USING GIN(service_areas);
CREATE INDEX IF NOT EXISTS idx_cleaners_search ON cleaners
  USING GIN (
    to_tsvector(
      'simple',
      COALESCE(business_name, '') || ' ' ||
      COALESCE(first_name, '') || ' ' ||
      COALESCE(last_name, '') || ' ' ||
      COALESCE(contact_name, '') || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(phone, '') || ' ' ||
      COALESCE(alternate_phone, '') || ' ' ||
      COALESCE(suburb, '') || ' ' ||
      COALESCE(postcode, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(state, '') || ' ' ||
      COALESCE(abn, '')
    )
  );

CREATE TABLE IF NOT EXISTS cleaner_comments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id   UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  author_name  TEXT NOT NULL DEFAULT 'Admin',
  comment      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_comments_cleaner_id ON cleaner_comments(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_comments_created_at ON cleaner_comments(created_at DESC);

CREATE TABLE IF NOT EXISTS cleaner_email_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  description  TEXT,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaner_email_templates_name_unique ON cleaner_email_templates(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_cleaner_email_templates_active ON cleaner_email_templates(is_active);

CREATE TABLE IF NOT EXISTS cleaner_emails (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id            UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  template_id           UUID REFERENCES cleaner_email_templates(id) ON DELETE SET NULL,
  template_name         TEXT,
  to_email              TEXT NOT NULL,
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'sent', 'failed', 'delivered', 'opened', 'clicked', 'bounced')),
  provider_message_id   TEXT,
  error_message         TEXT,
  sent_by               TEXT,
  sent_at               TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_emails_cleaner_id ON cleaner_emails(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_emails_status ON cleaner_emails(status);
CREATE INDEX IF NOT EXISTS idx_cleaner_emails_provider_message_id ON cleaner_emails(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_emails_created_at ON cleaner_emails(created_at DESC);

ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cleaners' AND policyname = 'Service role full access — cleaners'
  ) THEN
    CREATE POLICY "Service role full access — cleaners"
      ON cleaners FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cleaner_comments' AND policyname = 'Service role full access — cleaner_comments'
  ) THEN
    CREATE POLICY "Service role full access — cleaner_comments"
      ON cleaner_comments FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cleaner_email_templates' AND policyname = 'Service role full access — cleaner_email_templates'
  ) THEN
    CREATE POLICY "Service role full access — cleaner_email_templates"
      ON cleaner_email_templates FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cleaner_emails' AND policyname = 'Service role full access — cleaner_emails'
  ) THEN
    CREATE POLICY "Service role full access — cleaner_emails"
      ON cleaner_emails FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleaners_updated_at'
  ) THEN
    CREATE TRIGGER trg_cleaners_updated_at
      BEFORE UPDATE ON cleaners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleaner_email_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_cleaner_email_templates_updated_at
      BEFORE UPDATE ON cleaner_email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

INSERT INTO cleaner_email_templates (name, description, subject, body)
VALUES
  (
    'Availability check',
    'Ask a cleaner whether they can inspect or quote a new site.',
    'Availability request for {{suburb}} site',
    'Hi {{contact_name}},

We have a potential site that may suit your coverage area.

Could you please confirm whether you are available for an inspection or quote, and whether the work would suit your team?

Thanks,
Secure Cleaning Operations'
  ),
  (
    'Document renewal',
    'Request updated insurance, police check, or induction documents.',
    'Document renewal request',
    'Hi {{contact_name}},

Could you please send through your updated compliance documents when you have a chance?

We are currently checking insurance, police check, and induction records for our cleaner database.

Thanks,
Secure Cleaning Operations'
  ),
  (
    'New site introduction',
    'Send an introductory note before assigning or discussing a new site.',
    'New site opportunity',
    'Hi {{contact_name}},

We have a new site opportunity that may be a good fit for {{business_name}}.

Please review the details below and let us know whether you would like to discuss it further.

Thanks,
Secure Cleaning Operations'
  ),
  (
    'Performance follow-up',
    'Follow up on a quality, attendance, or operations matter.',
    'Follow-up from Secure Cleaning Operations',
    'Hi {{contact_name}},

We wanted to follow up on a recent operations matter and keep the communication clear in writing.

Please reply when you have reviewed the notes below.

Thanks,
Secure Cleaning Operations'
  )
ON CONFLICT (LOWER(name)) DO UPDATE SET
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  is_active = TRUE;
