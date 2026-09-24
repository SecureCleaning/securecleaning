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

Apply `admin_quote_deletion_migration.sql` after the CRM, final-quote, contract-product,
and contract-sale migrations. It installs the service-role-only transactional deletion
RPC used by the owner-only dashboard control. Accepted or sent final quotes and quotes
linked to bookings, winning opportunities, contract products, or product sales are
protected from deletion. CRM opportunities remain after removable quote links are cleared.

Apply `final_quote_document_guard_repair_migration.sql` after the final-quote revision
migrations. It restores the versioned-document trigger after production drift introduced
a misspelled `EXCLUDED.superseded_by` reference that blocked revised final quote saves.
