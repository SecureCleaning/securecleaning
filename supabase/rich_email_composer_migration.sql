-- Shared rich-email composer storage. Safe to re-run.
-- Apply after the existing Client CRM, cleaner email, and contract-product broadcast migrations.

alter table if exists public.crm_email_templates
  add column if not exists body_document jsonb,
  add column if not exists body_html text;

alter table if exists public.crm_email_template_versions
  add column if not exists body_document jsonb,
  add column if not exists body_html text;

alter table if exists public.crm_communications
  add column if not exists body_document_snapshot jsonb,
  add column if not exists body_html_snapshot text,
  add column if not exists final_html_snapshot text,
  add column if not exists final_text_snapshot text;

alter table if exists public.cleaner_email_templates
  add column if not exists body_document jsonb,
  add column if not exists body_html text;

alter table if exists public.cleaner_emails
  add column if not exists body_document_snapshot jsonb,
  add column if not exists body_html_snapshot text,
  add column if not exists final_html_snapshot text,
  add column if not exists final_text_snapshot text;

alter table if exists public.cleaner_broadcast_templates
  add column if not exists message_document jsonb,
  add column if not exists message_html text;

alter table if exists public.cleaner_broadcast_campaigns
  add column if not exists intro_document_snapshot jsonb,
  add column if not exists intro_html_snapshot text;

alter table if exists public.cleaner_broadcast_recipients
  add column if not exists subject_snapshot text,
  add column if not exists final_html_snapshot text,
  add column if not exists final_text_snapshot text;

comment on column public.crm_communications.final_html_snapshot is
  'Immutable, sanitised HTML exactly as accepted for provider delivery.';
comment on column public.cleaner_emails.final_html_snapshot is
  'Immutable, sanitised HTML exactly as accepted for provider delivery.';
comment on column public.cleaner_broadcast_recipients.final_html_snapshot is
  'Immutable personalised HTML for this campaign recipient.';
