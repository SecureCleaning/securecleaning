# Existing invoice payment terms and reference

The saved payment reference already feeds the invoice renderer. Its resolved value now appears directly below the bank account number instead of in a separate line above the bank block. A custom reference regression proves this is not a hardcoded invoice number.

The owner action is now **Apply saved payment details**. Its review shows bank account, reference template and payment terms, and explicitly applies all three from the saved template to the selected existing invoice. Merely saving global settings continues to affect future invoices. Original invoice snapshots remain immutable; each explicit correction retains actor/time and the existing atomic audit record. Applying sends no email and does not modify price, GST or cleared payments.

## Files and contract
- `src/components/admin/ContractSalesWorkspace.tsx`: updated action, review and template notices.
- `src/lib/contractSales.ts`: optional boolean `includePaymentTerms` on existing `invoice-bank.apply` action; omitted/false retains bank-only behavior. Independently resolves the latest non-null terms correction, so a later bank-only update cannot revert terms. Preview/download/resend/bundle use the same resolution.
- `src/lib/contractSaleInvoicePdf.ts`: resolved reference beside bank details; revised invoice terms accompany an existing payment-plan schedule without replacing it.
- `supabase/contract_sale_invoice_terms_revision_migration.sql`: one nullable checked `payment_terms_snapshot` column on existing append-only revision table. Apply after bank-details migration and before this application release. No historical row rewrite, new grants, dependencies or external email side effects.
- `tests/contract-product-sales.test.mjs`: stale original terms no longer displayed on invoice card; current preview is the source.
- `tests/invoice-payment-preview.test.mjs`: explicit opt-in/backward compatibility, custom reference/terms rendering and matching resend/bundle attachments, including a payment-plan case.
- `tests/integration/invoice-bank-postgres.mjs`: migration repeatability, nullable legacy rows, immutable terms corrections and preservation through later bank-only revisions; existing permission/owner/audit tests retained.

## Limits and verification
Signed agreements and agreed payment schedules are not amended by changing invoice wording. With a plan, explicitly revised invoice terms appear on an additional payment-details page and in the invoice email while the schedule remains intact. The owner must review wording for consistency. Previously emailed PDF bytes cannot change.

Focused release-coordinator review accepted the current-preview card wording and explicit unchanged-schedule labels, with no remaining blocking finding.

341 Node tests, type-check, lint, production build using synthetic environment and git diff check passed. PGlite fixture passed. Rendered PDF manually inspected with synthetic revised terms and a custom reference beneath the account number. No authenticated live save/apply, production migration/deploy, invoice change or email was performed in this follow-up.
