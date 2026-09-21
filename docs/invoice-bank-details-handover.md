# Invoice bank details restoration

## Problem and behavior
The released invoice template lacked the dedicated bank fields retained in the older Playground checkout. Template edits only affect future invoice snapshots, so appending bank details to payment terms did not alter an existing invoice. The PDF also displayed only four wrapped lines of ordinary payment terms.

Restores account name, optional bank name, BSB, account number and payment reference fields. New invoices snapshot these. The owner can select **Apply saved bank details** beside an existing invoice and review the saved account before applying. The operation copies only bank instructions, not contractual payment terms, price, tax, recipient, payment ledger or agreement. It sends no email. Current preview, download, invoice resend and agreement PDF attachments resolve the latest explicit bank revision. Original snapshots and revision history are immutable. Existing previously emailed attachments cannot be changed.

Bank details appear on the first PDF page when space permits, otherwise on a payment-details page. Long ordinary payment terms continue on an additional page. Payment-plan terms continue to use the linked plan schedule. A bank correction does not change an agreed plan.

## Files and API
- `src/components/admin/ContractSalesWorkspace.tsx`: restored inputs, clearer save notice, owner-only invoice action and account review.
- `src/lib/contractSales.ts`: template validation/mapping, new invoice snapshots, owner/sale/invoice checks, stale-template guard, latest revision resolution and email bank details.
- `src/lib/contractSaleInvoicePdf.ts`: bank block and full ordinary terms continuation.
- `src/app/api/admin/contract-sales/route.ts`: new POST action `invoice-bank.apply` with `saleId`, `invoiceId`, `templateUpdatedAt`; uses existing authentication and mutation protections.
- `tests/contract-product-sales.test.mjs`: updated template notice expectation.
- `tests/invoice-payment-preview.test.mjs`: preview/resend/bundle consistency, existing invoice correction, owner restriction, void rejection, stale template, no email or invoice rewrite, long terms.
- `tests/integration/invoice-bank-postgres.mjs`: real migration application twice, owner check, immutable snapshots/revisions, atomic audit, unchanged invoice amount and anon denial.
- `supabase/contract_sale_invoice_bank_details_migration.sql`: additive bank columns and service-only append-only revision table with audit trigger. Compatible with bank columns already present from the older preview/history migration. Does not include that older migration's unrelated history workflow.

No dependencies changed.

## Rollout and existing invoice
Apply the forward migration before releasing application code; invoice rendering intentionally fails if revision lookup fails rather than hiding a correction. No production migration, invoice change, deployment or real email was performed in this task.

After deployment, review and save the actual bank fields, then use **Apply saved bank details** on the existing invoice and preview it. This is a per-invoice action, not a bulk rewrite. Payment terms containing manually typed bank details should be reviewed for duplicate/conflicting instructions; the correction intentionally does not rewrite historical contractual terms. No account details are hardcoded in code, tests or migration.

## Verification
Type check, lint, 340-test Node suite, production build with synthetic environment and diff whitespace check pass. Database fixture checks pass, including production-like default ALL grants and service-role TRUNCATE/UPDATE/DELETE denial. Independent release-coordinator review confirmed the narrowed grants, active-owner lock and aligned account-name validation; no remaining narrow integration findings. Rendered synthetic invoice manually inspected: bank block, confirmed payment, outstanding amount and footer fit without overlap. Preview/resend/attachment checks used mocked network calls; authenticated admin browser save/apply and live invoice verification remain deployment checks.
