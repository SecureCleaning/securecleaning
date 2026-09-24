-- Apply after all existing table-creating migrations and before 2026-10-30.
-- Supabase no longer grants Data API access to new public tables by default.
-- This preserves the application's existing server-side supabase-js access without
-- adding browser-role grants for private operational tables.
BEGIN;

DO $$
DECLARE
  managed_tables TEXT[] := ARRAY[
    'admin_audit_log',
    'admin_staff_accounts',
    'ai_chat_sessions',
    'availability_blocks',
    'bookings',
    'cleaner_broadcast_campaign_products',
    'cleaner_broadcast_campaigns',
    'cleaner_broadcast_recipients',
    'cleaner_broadcast_suppressions',
    'cleaner_broadcast_templates',
    'cleaner_comments',
    'cleaner_documents',
    'cleaner_email_batches',
    'cleaner_email_pacing',
    'cleaner_email_templates',
    'cleaner_emails',
    'cleaners',
    'client_crm_deletion_archive',
    'clients',
    'consumable_catalog_settings',
    'consumable_products',
    'contract_commission_assignments',
    'contract_commission_claims',
    'contract_commission_payouts',
    'contract_commission_settings',
    'contract_product_access_links',
    'contract_product_activity',
    'contract_product_interest_notifications',
    'contract_product_interests',
    'contract_product_sales',
    'contract_product_versions',
    'contract_products',
    'contract_sale_agreements',
    'contract_sale_checklist_uploads',
    'contract_sale_inspection_messages',
    'contract_sale_inspection_templates',
    'contract_sale_inspections',
    'contract_sale_invoice_bank_revisions',
    'contract_sale_invoice_templates',
    'contract_sale_invoices',
    'contract_sale_payment_allocations',
    'contract_sale_payment_plan_instalments',
    'contract_sale_payment_plans',
    'contract_sale_payments',
    'contract_sale_site_assignments',
    'contract_sale_site_checklists',
    'contract_sales',
    'crm_communications',
    'crm_email_suppressions',
    'crm_email_template_versions',
    'crm_email_templates',
    'crm_opportunities',
    'crm_opportunity_intakes',
    'crm_opportunity_notes',
    'crm_opportunity_quotes',
    'crm_organisations',
    'crm_reconciliation_issues',
    'inspectors',
    'leads',
    'owner_operator_ratings',
    'owner_operators',
    'quote_deletion_archive',
    'quote_final_document_versions',
    'quote_send_attempts',
    'quotes',
    'site_content',
    'sites'
  ];
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY managed_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  managed_sequences TEXT[] := ARRAY[
    'contract_product_code_seq',
    'contract_sale_code_seq',
    'contract_sale_invoice_bank_revisions_id_seq',
    'contract_sale_invoice_number_seq'
  ];
  sequence_name TEXT;
BEGIN
  FOREACH sequence_name IN ARRAY managed_sequences LOOP
    IF to_regclass(format('public.%I', sequence_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role',
        sequence_name
      );
    END IF;
  END LOOP;
END
$$;

-- Public marketing pages are the only application path that uses the anon
-- Supabase client directly. RLS continues to restrict this table to reads.
GRANT SELECT ON TABLE public.site_content TO anon, authenticated;

COMMIT;
