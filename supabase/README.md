# Database source convention

`schema.sql` is the clean-database baseline. Applied environments must then run additive migration files in repository order; migrations are never copied backward into historical files or replaced by ad-hoc production SQL.

Apply `data_api_explicit_grants_migration.sql` after every existing table-creating
migration and before 2026-10-30. It makes the current Data API privileges explicit
for all application tables and sequences before Supabase stops granting access to new
objects automatically. Future migrations that create a table or sequence must include
the required least-privilege `GRANT` in that same migration. Private operational tables
receive no new browser-role grants; only `site_content` is granted directly to browser roles.

For the final quote workflow, apply:

1. `audit_log_migration.sql`
2. `quote_workflow_migration.sql`
3. `final_quote_scope_workflow_migration.sql`

The final migration is authoritative for the service-role-only claim, finalization, and privileged reconciliation RPCs because those functions depend on the audit table created by the first migration. The baseline schema includes the tables, constraints, indexes, RLS, and immutable-document trigger needed before those RPCs are installed.

For CRM profile editing, apply `client_crm_agent_partial_profile_migration.sql`
after `client_crm_optional_business_name_migration.sql` and before the matching
application release. It permits active agents to edit only opportunities assigned
to them, makes client email nullable, and keeps optimistic locking and audit logging.

For contract product sales, start from `schema.sql`, then apply `audit_log_migration.sql`,
`sites_migration.sql`, `staff_accounts_migration.sql`, the cleaner migrations,
`client_crm_foundation_migration.sql`, and the existing quote workflow migrations before this ordered product sequence:

1. `contract_products_migration.sql`
2. `contract_product_saved_quote_won_migration.sql`
3. `contract_product_estimated_hours_text_migration.sql`
4. `monthly_cleaning_frequency_migration.sql`
5. `contract_product_uuid_generation_post_monthly_fix_migration.sql`
6. `contract_product_won_quote_status_migration.sql`
7. `contract_product_sales_migration.sql`
8. `contract_sale_approved_cleaners_migration.sql`
9. `contract_sale_tax_invoice_workflow_migration.sql`
10. `contract_sale_document_bundle_workflow_migration.sql`

After `contract_products_interest_notifications_migration.sql`, apply
`contract_product_activity_migration.sql` before deploying the product activity UI. It
backfills one private activity entry for each existing interest, records every new
submission separately, and keeps the displayed interest status synchronized. The table
is service-role only and is never used by the public job-listing response.

The post-monthly UUID migration is deliberately ordered after the monthly-frequency
function replacement. It is rerunnable, preserves the monthly annual-visit mapping,
and restores the built-in UUID generator under the restricted function search path.
The won-quote status migration atomically marks the product's source quote accepted,
locks its firm-quote workflow, and backfills only won opportunities that already have
their matching contract product.

The sales migration is additive. It creates the product-sale ledger, GST-inclusive invoices, pending/confirmed payments, payment plans, three-party inspections, versioned agreements, a private signed-agreement bucket, and cleaner-to-site handovers. Apply it before deploying application code that calls `/api/admin/contract-sales`.
The approved-cleaner migration updates the protected sale and handover functions so cleaner workflow approval controls eligibility while compliance remains a separately visible operational status.
The tax-invoice workflow migration adds the service-role-only global invoice template, immutable supplier, recipient, wording, deposit and sender snapshots, introduces the full sale tax-invoice type, and updates payment, inspection and handover gates while preserving legacy deposit and balance invoices.
The document-bundle migration adds explicit final-price confirmation, locks that price once an invoice or agreement snapshot exists, lets the tax invoice and agreement be prepared in either order, and removes the obsolete signed-agreement prerequisite from invoice preparation. The application sends the matching tax-invoice and agreement PDFs together; signature and cleared-deposit checks remain later inspection and handover gates.

Apply `contract_sale_automatic_commission_assignment_migration.sql` after
`contract_sale_commissions_plans_migration.sql` and
`contract_sale_start_eligibility_repair_migration.sql`. It automatically locks the
current rates when the final-quote sender and sale creator both resolve to active agent
staff accounts. Ambiguous or owner-created sales remain in the manual owner queue. The
owner may correct the two agent assignments until an agent invoice or payout exists;
rates, claims, and payouts remain immutable, and every correction is audited.

Apply `contract_sale_first_invoice_cleaner_profile_migration.sql` after the contract
sale, cleaner, staff-account, rich-email and audit migrations. It adds the editable
first-purchase profile email template and a service-role-only, one-row-per-cleaner
delivery ledger. The reservation RPC accepts only a sent full-sale invoice, rechecks
the actor and sale assignment, verifies the cleaner email, and refuses later invoices.
Existing invoice history is not backfilled. The application sends the private 48-hour
cleaner portal link separately after the first document bundle succeeds and copies the
active agent who created the product sale.

Apply `contract_sale_inspection_calendar_feed_migration.sql` after
`contract_sale_inspection_communications_checklist_migration.sql`. It adds the
`subscription_feed` delivery state used when a product-sale inspection is published
to the linked agent's private calendar feed without a direct Google Calendar write.

Apply `admin_quote_deletion_migration.sql` after the CRM, final-quote, contract-product,
and contract-sale migrations. It installs the service-role-only transactional deletion
RPC used by the owner-only dashboard control. Accepted or sent final quotes and quotes
linked to bookings, winning opportunities, contract products, or product sales are
protected from deletion. CRM opportunities remain after removable quote links are cleared.

Apply `final_quote_document_guard_repair_migration.sql` after the final-quote revision
migrations. It restores the versioned-document trigger after production drift introduced
a misspelled `EXCLUDED.superseded_by` reference that blocked revised final quote saves.

Apply `accepted_final_quote_revision_migration.sql` after the final-quote revision and
document-guard repair migrations. It permits the owner and an assigned agent to save a
new version of an accepted final quote while preserving acceptance, immutable document
history, and audit attribution. Existing contract products, invoices, and agreements are
left unchanged.

Apply `accepted_final_quote_revision_status_cast_repair.sql` immediately after
`accepted_final_quote_revision_migration.sql`. It preserves the same function contract
while explicitly casting the revised quote status to the `quote_status` enum.

### SMS quote follow-up (initially disabled)

Apply `sms_workflow_migration.sql` after the final-quote workflow and audit migrations.
It creates private service-role-only SMS settings, consent, queue, events, replies and alert tables.
Use `sms_scheduler_migration.sql` only after deployment and Vault setup; it activates the minute worker.
Apply `sms_quote_status_enum_repair.sql` after `sms_workflow_migration.sql`. It keeps
workflow-only terminal statuses out of PostgreSQL enum coercion in quote update and SMS dispatch checks.
See `docs/sms-workflow-release.md` for environment prerequisites, controlled tests, cancellation,
operating costs and rollback. Do not enable sending or create provider credentials in SQL history.
