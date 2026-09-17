# Invoice preview and confirmed payments

Baseline: 54305305d08597491b9e6c0da5c1774fd541702a. Owner: invoice/payment task in b3b0. Not committed or deployed.

## Behavior

- Prepare the invoice using the existing action (no email is sent), then Preview invoice from Tax invoice & payments. The same link is available alongside the agreement before sending the document bundle.
- After delivery, Preview invoice remains available and opens a current PDF in a new tab. Download PDF retains its existing attachment behavior.
- Recording evidence does not claim that funds cleared. An owner/manager must select Confirm cleared. Existing confirmation RPC atomically creates the allocation, rejects overpayment, and returns without a second allocation on repeated confirmation. No payment-policy or RPC change.
- Preview, download, resend, and agreement bundle now all read confirmed allocations. Previously only download included allocations; resend and bundle rendered zero paid.
- PDF and resend email show payments received, outstanding total, and unpaid portion of the deposit (zero once covered). Original invoice number, issue date, price, GST, recipient/supplier and contractual terms remain unchanged.
- Preview is a current copy, not an archived original email attachment. Existing system does not persist historical sent PDF bytes. UI makes this explicit.

## Exact file manifest

- src/lib/contractSales.ts: shared paginated allocation reader for all PDF paths; accurate resend email totals. Read failures abort before email or agreement send claim.
- src/lib/contractSaleInvoicePdf.ts: current payment summary including confirmed paid, outstanding and remaining deposit.
- src/app/api/admin/contract-sales/invoices/route.ts: optional preview=1 sets inline disposition. Same actor/sale authorization and private no-store response.
- src/components/admin/ContractSalesWorkspace.tsx: before/after preview links, payment confirmation guidance, disable busy/unknown resends.
- tests/invoice-payment-preview.test.mjs: mocked provider/database tests; no external sends.
- docs/invoice-preview-payments-handover.md: this document.

## Contracts and rollout

No migrations, dependencies, schema changes or response-body changes. Only optional GET query preview=1; default remains attachment. All reads retain existing role/assignment/state checks and invoice-to-sale filtering. Existing pending/failed/unknown delivery semantics remain intact. Requires existing sales/payment allocation schema already used by download. Deploy source changes together only after deployment authorization.

## Verification

- npm run type-check: passed.
- npm run lint: passed, no warnings/errors.
- npm test: 271 passed, zero failed/skipped.
- npm run build: passed with synthetic Supabase environment. Existing Browserslist data-age notice only.
- git diff --check: passed.
- Focused runtime tests compare preview and resend PDF bytes at zero paid, partial deposit, full deposit, later part payment and fully paid stages; check corresponding email balances; verify bundle uses same PDF; deny anonymous/out-of-region/unassigned access and void invoices; stop sends on allocation read error; assert inline/default attachment/private cache headers.
- Manually rendered synthetic $5,148 invoice with confirmed $500 deposit using Poppler and visually inspected PNG. Correct $500 received/$0 deposit due/$4,648 outstanding; no clipping or overlap.

## Limits and follow-up

No live authenticated browser click-through, production payment confirmation or actual provider delivery performed. No production data changed. Deployment smoke check should open a prepared invoice before sending and a previously sent invoice, then verify an existing confirmed payment is reflected without creating test financial records or sending emails. Preview and send each read current allocations; a payment confirmed between them will appear on the later copy. Original contractual payment terms intentionally remain as snapshotted wording. Exact historical sent-attachment storage would be a separate feature.
