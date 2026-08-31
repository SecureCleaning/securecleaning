# Database source convention

`schema.sql` is the clean-database baseline. Applied environments must then run additive migration files in repository order; migrations are never copied backward into historical files or replaced by ad-hoc production SQL.

For the final quote workflow, apply:

1. `audit_log_migration.sql`
2. `quote_workflow_migration.sql`
3. `final_quote_scope_workflow_migration.sql`

The final migration is authoritative for the service-role-only claim, finalization, and privileged reconciliation RPCs because those functions depend on the audit table created by the first migration. The baseline schema includes the tables, constraints, indexes, RLS, and immutable-document trigger needed before those RPCs are installed.

For contract product sales, start from `schema.sql`, then apply `audit_log_migration.sql`,
`sites_migration.sql`, `staff_accounts_migration.sql`, the cleaner migrations,
`client_crm_foundation_migration.sql`, and the existing quote workflow migrations before this ordered product sequence:

1. `contract_products_migration.sql`
2. `contract_product_uuid_generation_fix_migration.sql`
3. `contract_product_saved_quote_won_migration.sql`
4. `contract_product_estimated_hours_text_migration.sql`
5. `contract_product_sales_migration.sql`
6. `contract_sale_approved_cleaners_migration.sql`
7. `contract_sale_tax_invoice_workflow_migration.sql`

The sales migration is additive. It creates the product-sale ledger, GST-inclusive invoices, pending/confirmed payments, payment plans, three-party inspections, versioned agreements, a private signed-agreement bucket, and cleaner-to-site handovers. Apply it before deploying application code that calls `/api/admin/contract-sales`.
The approved-cleaner migration updates the protected sale and handover functions so cleaner workflow approval controls eligibility while compliance remains a separately visible operational status.
The tax-invoice workflow migration adds the service-role-only global invoice template, immutable supplier, recipient, wording, deposit and sender snapshots, introduces the full sale tax-invoice type, and updates payment, inspection and handover gates while preserving legacy deposit and balance invoices.
