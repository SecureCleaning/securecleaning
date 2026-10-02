# Commission rate revisions

Owner-only sale-level rate revisions add a preview and atomic confirmation to the
existing commission workspace. Defaults and beneficiary attribution are unchanged.
The application never leaves an assignment in an unlocked state.

## Release order

1. Review and apply `supabase/migrations/20261002045410_commission_rate_revisions.sql`
   after `contract_sale_automatic_commission_assignment_migration.sql`.
2. Deploy the application. Owner workspace reads require the new history table.
3. Verify owner preview and cancellation on a real sale without confirming a change.
   Confirm that agent access remains restricted to their own balances.

No backfill or dependency changes. No automatic emails, bank payments, credit notes,
or calendar actions. Prior application versions remain compatible after migration.

## Contracts and safeguards

Existing POST `/api/admin/commissions` accepts two new owner-only actions:
`preview_revision` (saleId, winBps, saleBps, reason) returns a preview;
`revise` additionally requires expected (the full reviewed preview) and requestId.
All existing actions retain their behavior. GET adds owner-only revision history.

The migration adds an append-only RLS-enabled revision table and three service-role
only SECURITY INVOKER functions. Preview checks active owner identity and an active
sale, locks sale then assignment, and projects the canonical commission formula.
Confirmation repeats those checks and compares the complete preview, including the
revision count. Rate updates, revision history and audit entry commit together.
Claims/payouts use the same lock order. Request IDs make retry after network loss safe.

Rates are basis points, nonnegative with combined maximum 100%. Calculations exclude
GST, round combined cumulative entitlement before allocating shares, and preserve
existing full-payment or signed active-plan eligibility rules. Changing a zero-rate
assignment, distinct beneficiaries, and the same beneficiary for both roles are supported.

Submitted agent invoices and payments are not rewritten or deleted. Reductions can
show invoiced excess or negative unpaid commission. The UI explicitly identifies these
for separate reconciliation or recovery; this release does not record credit notes or
recovery receipts. Existing payout limits prevent paying above revised entitlement.

## Files

- `src/components/admin/CommissionsWorkspace.tsx`
- `src/components/admin/CommissionRevisionEditor.tsx`
- `src/lib/commissions.ts`
- `src/lib/commissionRevision.ts`
- `src/app/api/admin/commissions/route.ts`
- The migration above
- `tests/commission-revisions.test.mjs`
- `tests/commission-automatic-assignment.test.mjs`
- `tests/integration/commission-revisions-postgres.mjs`

## Verification

Run the repository full suite and `node tests/integration/commission-revisions-postgres.mjs`.
The isolated PostgreSQL test covers migration replay, exact preview/result parity,
owner/agent/manager authorization, invalid rates, unchanged invoices/payouts, overpayments,
stale previews after claims/receipts/plan changes, request replay, direct-edit protection,
zero rates, same-agent rounding, cancelled sales, service-role execution, RLS and ACLs.

Do not include the unrelated calendar changes still present in the source worktree;
they have already been deployed through the coordinator.

Source validation: all 399 tests, type-check, lint, production build (nonsecret
Supabase placeholders), and git diff --check passed. The isolated PostgreSQL suite
also passed, including rollback after an audit insertion failure. Live browser
verification and production database advisors remain release-time checks; no live
commission records were edited and no migration was applied to production.
