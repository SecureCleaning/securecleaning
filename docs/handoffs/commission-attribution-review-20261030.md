# Commission attribution review and late attribution retry

Baseline: verified production f23be83cf08340fd81ca1a74c2f3c4d3774f70fb (Vercel dpl_48LpqHNLuTixjgHkGAtKzrTFGaMr).

## Behavior
- Commissions has a persistent owner review queue for every non-cancelled sale without an assignment, including historical, completed and active-plan sales. Added Refresh commissions and a direct sale-to-assignment link with known-agent suggestions. Complete pagination replaces the old unpaginated unmatched-sale query.
- Product sales show a warning to authorised staff until assignment exists. Only the reason is returned to product-sale clients, not suggested beneficiary IDs or commission rates.
- Owner review can prefill uniquely known active agents; uncertain beneficiaries must be selected explicitly. The existing owner-only assignment RPC locks current rates.
- Automatic assignment now retries when source attribution or sale status changes and when final-quote sender details are recorded later. It never changes existing assignments or rates. Ambiguous legacy session mappings are not assigned arbitrarily.
- No historical bulk backfill. The forward migration now includes the user-requested targeted repair for PS-2026-01007 using verified original sender/creator evidence and current rates, only if still unassigned. No live writes have been performed by this feature task.

## Migration / rollout
Apply `supabase/migrations/20261029215838_commission_attribution_review.sql` BEFORE deploying application code. Requires the existing automatic-assignment migration. It adds a service-role-only status view, an internal assignment helper and quote/sale triggers. No environment or application dependency changes.

Existing missing historical sales remain in the review queue. Later workflow changes can assign them only when both agents are reliably identifiable. Follow-up investigation found St Andrews PS-2026-01007 has retained successful sending evidence: Renata sent final quote SC-20261013-41693602 on 14 October Melbourne time, finalized attempt 17c203ea-1fac-4a40-8433-5a736cb035d8. Subsequent revisions cleared current-version sent fields. The migration now falls back to the earliest successful original send across finalized attempts, archived versions and current sent metadata. Failed/unconfirmed sends are excluded. Same-time conflicting agents require review. A later resend by another agent cannot replace the original sender. Renata also created the sale. No live assignment was saved; historical rows are still available for owner review with reliable suggestions. PS-2026-01009 already has an assignment; it correctly does not appear as unmatched. Syncba PS-2026-01004 was already assigned by the time of the final read-only check.

The API adds review reasons and suggestions to the owner's existing `sales` list; product-sale data gains optional `commissionReviewReason`. Agent commission workspace remains beneficiary-scoped.

## Payment-plan verification
The production commission view uses confirmed payment allocations. A signed active/completed plan permits proportionate commission on each receipt, including the deposit. Without a signed plan, full invoice payment is required. Cumulative entitlement uses invoice net-of-GST value and locked rates; already claimed amounts are deducted from available-to-invoice balances. No calculation change was necessary.

Local SQL scenario: $3,300 gross, $300 GST, 20% + 20%; successive receipts $500, $1,000, $1,800 produce cumulative earned $181.82, $545.45, $1,200.00. Cent rounding is cumulative, not independently rounded per payment.

## Validation
- `scripts/test-commission-attribution.mjs` executes the forward migration and existing production commission view in isolated in-memory PostgreSQL. Set PGLITE_MODULE_PATH to a separately installed PGlite module. No network or production connection.
- Tests cover historical flags, missing attribution, late sender retry, existing locked rates, idempotent audit, ambiguous identity, cancelled sales, database privileges, progressive signed-plan receipts and deduction of claims.
- `tests/commission-review.test.mjs` verifies pagination, filters, priority, authorised-ID restriction and errors.
- Read-only production checks confirmed current attribution and balances for PS-2026-01004/01007/01009. No live UI mutation or real customer test sends.
- Browser verification of the new UI remains for preview/production after migration; source reviewed using the React best-practices checklist.

## Changed files and final checks
- src/lib/commissionReview.ts: scoped, paginated attribution review reads.
- src/lib/commissions.ts: owner review queue data.
- src/lib/contractSales.ts: per-sale review reason.
- src/components/admin/CommissionsWorkspace.tsx: persistent queue, known-agent suggestions and payment-plan explanation.
- src/components/admin/ContractSalesWorkspace.tsx: visible sale warning and owner review link.
- Forward migration, SQL test script and review tests listed above.

All 685 tests passed (the suite's local HTTP tests require loopback permission). Type-check, lint, production build with synthetic credentials and git diff --check passed. Local SQL integration script passed separately. No application dependencies changed. Editing complete; not committed or deployed. Coordinator should run migration before app release and verify owner queue and agent sale warning in the browser.

## Follow-up live UI verification
Reopened signed-in Safari admin Commissions on 30 October. PS-2026-01007 was present in the unmatched dropdown and selected successfully. No assignment saved. The earlier missing-list report could not be reproduced after a fresh page load. Existing defaults displayed 20% site won + 20% sale. Root cause of missing automatic assignment is confirmed quote-revision clearing of current send metadata, not missing historical sender evidence. SQL tests now also cover revised sent quotes, archived versions and failed attempts not changing attribution.

## Release authorization, 30 October
User requested deployment through coordinator and clarified that the original quote sender is the assignee (site-winning commission). Selling commission remains sale creator. Migration now chooses earliest successful send, preserves locked assignments, and includes an audited targeted PS-2026-01007 repair through the same evidence-based helper. Verify its resulting assignment and commission balance after migration.

## Additional request: client business in commission statements

Added `Client business` between `Sale / agent` and `Allocations` for owner and agent statements, and in statement CSV exports. Server enrichment reads only sales already present in the authorized commission balances, selecting the snapshot business name and falling back to the linked CRM business name. No contact details or site addresses are returned. Missing names display `Not recorded`.

Additional changed file: `tests/commission-policy.test.mjs`; implementation in `src/lib/commissions.ts` and `src/components/admin/CommissionsWorkspace.tsx`. API balances now include `client_business`. No additional migration or dependencies. Scope test asserts sale/opportunity/contact IDs and minimal selected fields; all 685 application tests, type-check and lint pass. Production baseline independently reverified as f23be83 on the Ready domain alias before editing. No live records changed or messages sent. Browser visual verification not performed for the additional column.

Additional-column production build also passed (synthetic local credentials, no live sends/writes); full validation complete. Logs: `/tmp/sc-company-{type,lint,test,build}.log`.
