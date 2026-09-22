-- Secure Cleaning - product-sale inspection communications, calendar and checklist workflow.
-- Apply after contract_product_sales_migration.sql and the invoice workflow migrations.
-- Additive: existing inspections, invoices, agreements and payment records are not rewritten.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_sale_inspection_templates (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  availability_subject text NOT NULL,
  availability_body_text text NOT NULL,
  availability_body_html text NOT NULL,
  availability_body_document jsonb,
  client_subject text NOT NULL,
  client_body_text text NOT NULL,
  client_body_html text NOT NULL,
  client_body_document jsonb,
  cleaner_subject text NOT NULL,
  cleaner_body_text text NOT NULL,
  cleaner_body_html text NOT NULL,
  cleaner_body_document jsonb,
  updated_by_staff_id uuid REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(availability_subject) BETWEEN 3 AND 200),
  CHECK (length(availability_body_text) BETWEEN 10 AND 5000),
  CHECK (length(client_subject) BETWEEN 3 AND 200),
  CHECK (length(client_body_text) BETWEEN 10 AND 5000),
  CHECK (length(cleaner_subject) BETWEEN 3 AND 200),
  CHECK (length(cleaner_body_text) BETWEEN 10 AND 5000)
);

INSERT INTO public.contract_sale_inspection_templates (
  id,
  availability_subject, availability_body_text, availability_body_html,
  client_subject, client_body_text, client_body_html,
  cleaner_subject, cleaner_body_text, cleaner_body_html
) VALUES (
  'default',
  'Site inspection availability - <<site_name>>',
  E'Hi <<client_first_name>>,\n\nWe are ready to arrange the site inspection for <<site_name>>. Please reply with the days and times that suit you, along with any access requirements we should know before attending.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  '<p>Hi &lt;&lt;client_first_name&gt;&gt;,</p><p>We are ready to arrange the site inspection for &lt;&lt;site_name&gt;&gt;. Please reply with the days and times that suit you, along with any access requirements we should know before attending.</p><p>Kind regards,<br>&lt;&lt;sender_name&gt;&gt;<br>&lt;&lt;sender_title&gt;&gt;<br>Secure Cleaning<br>&lt;&lt;sender_phone&gt;&gt;<br>&lt;&lt;sender_email&gt;&gt;</p>',
  'Site inspection confirmed - <<site_name>> - <<inspection_date>>',
  E'Hi <<client_first_name>>,\n\nThis confirms the Secure Cleaning site inspection at <<site_name>>.\n\nDate: <<inspection_date>>\nTime: <<inspection_time>>\nDuration: <<inspection_duration>>\nLocation: <<inspection_location>>\n\nA calendar invitation is attached. Please let us know if anything changes.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  '<p>Hi &lt;&lt;client_first_name&gt;&gt;,</p><p>This confirms the Secure Cleaning site inspection at &lt;&lt;site_name&gt;&gt;.</p><p><strong>Date:</strong> &lt;&lt;inspection_date&gt;&gt;<br><strong>Time:</strong> &lt;&lt;inspection_time&gt;&gt;<br><strong>Duration:</strong> &lt;&lt;inspection_duration&gt;&gt;<br><strong>Location:</strong> &lt;&lt;inspection_location&gt;&gt;</p><p>A calendar invitation is attached. Please let us know if anything changes.</p><p>Kind regards,<br>&lt;&lt;sender_name&gt;&gt;<br>&lt;&lt;sender_title&gt;&gt;<br>Secure Cleaning<br>&lt;&lt;sender_phone&gt;&gt;<br>&lt;&lt;sender_email&gt;&gt;</p>',
  'Site inspection booked - <<site_name>> - <<inspection_date>>',
  E'Hi <<cleaner_first_name>>,\n\nThe client has confirmed the site inspection for <<site_name>>.\n\nDate: <<inspection_date>>\nTime: <<inspection_time>>\nDuration: <<inspection_duration>>\nLocation: <<inspection_location>>\n\nPlease attend with <<sender_name>>. A calendar invitation is attached.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  '<p>Hi &lt;&lt;cleaner_first_name&gt;&gt;,</p><p>The client has confirmed the site inspection for &lt;&lt;site_name&gt;&gt;.</p><p><strong>Date:</strong> &lt;&lt;inspection_date&gt;&gt;<br><strong>Time:</strong> &lt;&lt;inspection_time&gt;&gt;<br><strong>Duration:</strong> &lt;&lt;inspection_duration&gt;&gt;<br><strong>Location:</strong> &lt;&lt;inspection_location&gt;&gt;</p><p>Please attend with &lt;&lt;sender_name&gt;&gt;. A calendar invitation is attached.</p><p>Kind regards,<br>&lt;&lt;sender_name&gt;&gt;<br>&lt;&lt;sender_title&gt;&gt;<br>Secure Cleaning<br>&lt;&lt;sender_phone&gt;&gt;<br>&lt;&lt;sender_email&gt;&gt;</p>'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.contract_sale_inspection_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  inspection_id uuid REFERENCES public.contract_sale_inspections(id) ON DELETE RESTRICT,
  message_type text NOT NULL CHECK (message_type IN ('availability_request','client_confirmation','cleaner_confirmation','staff_calendar_copy')),
  recipient_name_snapshot text NOT NULL,
  recipient_email_snapshot text NOT NULL,
  subject_snapshot text NOT NULL,
  body_text_snapshot text NOT NULL,
  body_html_snapshot text NOT NULL,
  body_document_snapshot jsonb,
  sender_staff_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  sender_name_snapshot text NOT NULL,
  sender_email_snapshot text NOT NULL,
  preview_fingerprint text NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  delivery_status text NOT NULL CHECK (delivery_status IN ('sent','failed','unknown')),
  provider_message_id text,
  delivery_error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_sale_inspection_messages_sale_idx
  ON public.contract_sale_inspection_messages(sale_id, sent_at DESC);

ALTER TABLE public.contract_sale_inspections
  ADD COLUMN IF NOT EXISTS client_subject_snapshot text,
  ADD COLUMN IF NOT EXISTS client_body_text_snapshot text,
  ADD COLUMN IF NOT EXISTS client_body_html_snapshot text,
  ADD COLUMN IF NOT EXISTS client_body_document_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS cleaner_subject_snapshot text,
  ADD COLUMN IF NOT EXISTS cleaner_body_text_snapshot text,
  ADD COLUMN IF NOT EXISTS cleaner_body_html_snapshot text,
  ADD COLUMN IF NOT EXISTS cleaner_body_document_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS calendar_id_snapshot text,
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_status text NOT NULL DEFAULT 'pending'
    CHECK (calendar_status IN ('pending','created','updated','email_fallback','failed')),
  ADD COLUMN IF NOT EXISTS calendar_error text;

CREATE TABLE IF NOT EXISTS public.contract_sale_site_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  checklist_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','handed_over','uploaded')),
  prepared_by_staff_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  updated_by_staff_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  handed_over_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_sale_checklist_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.contract_product_sales(id) ON DELETE RESTRICT,
  checklist_id uuid NOT NULL REFERENCES public.contract_sale_site_checklists(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  file_size_bytes integer NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 15728640),
  storage_path text NOT NULL UNIQUE,
  uploaded_by_staff_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_sale_checklist_uploads_sale_idx
  ON public.contract_sale_checklist_uploads(sale_id, uploaded_at DESC);

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('contract-sale-checklists','contract-sale-checklists',FALSE,15728640,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT(id) DO UPDATE SET public=FALSE,file_size_limit=15728640,
  allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png'];

ALTER TABLE public.contract_sale_inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sale_inspection_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sale_site_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sale_checklist_uploads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contract_sale_inspection_templates, public.contract_sale_inspection_messages,
  public.contract_sale_site_checklists, public.contract_sale_checklist_uploads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE ON public.contract_sale_inspection_templates TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.contract_sale_inspection_messages TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.contract_sale_site_checklists TO service_role;
GRANT SELECT,INSERT ON public.contract_sale_checklist_uploads TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Service role contract sale checklist files') THEN
    CREATE POLICY "Service role contract sale checklist files" ON storage.objects FOR ALL TO service_role
      USING (bucket_id='contract-sale-checklists') WITH CHECK (bucket_id='contract-sale-checklists');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_contract_sale_inspection_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Inspection message history is immutable.'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.delivery_status <> 'unknown'
      OR (to_jsonb(NEW) - ARRAY['delivery_status','provider_message_id','delivery_error']::text[])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['delivery_status','provider_message_id','delivery_error']::text[])
    THEN RAISE EXCEPTION 'Only an unresolved inspection message delivery outcome may be finalized.'; END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM admin_staff_accounts WHERE id=NEW.sender_staff_id AND active AND role::text IN ('owner','manager','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection sender access denied.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM contract_product_sales s WHERE s.id=NEW.sale_id AND s.status::text<>'cancelled'
    AND (EXISTS(SELECT 1 FROM admin_staff_accounts a WHERE a.id=NEW.sender_staff_id AND a.role::text IN ('owner','manager')) OR s.assigned_staff_id=NEW.sender_staff_id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product sale access denied.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_sale_inspection_message() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_sale_inspection_message_guard ON public.contract_sale_inspection_messages;
CREATE TRIGGER contract_sale_inspection_message_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.contract_sale_inspection_messages FOR EACH ROW EXECUTE FUNCTION public.guard_contract_sale_inspection_message();

CREATE OR REPLACE FUNCTION public.guard_contract_sale_checklist_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Checklist upload history is immutable.'; END IF;
  PERFORM 1 FROM admin_staff_accounts WHERE id=NEW.uploaded_by_staff_id AND active AND role::text IN ('owner','manager','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checklist uploader access denied.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM contract_product_sales s WHERE s.id=NEW.sale_id AND s.handover_at IS NOT NULL
    AND (EXISTS(SELECT 1 FROM admin_staff_accounts a WHERE a.id=NEW.uploaded_by_staff_id AND a.role::text IN ('owner','manager')) OR s.assigned_staff_id=NEW.uploaded_by_staff_id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete handover before uploading the checklist.'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_sale_checklist_upload() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_sale_checklist_upload_guard ON public.contract_sale_checklist_uploads;
CREATE TRIGGER contract_sale_checklist_upload_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.contract_sale_checklist_uploads FOR EACH ROW EXECUTE FUNCTION public.guard_contract_sale_checklist_upload();

COMMIT;
