# Commissions and upfront payment plans

Implementation baseline: 2e0d5496b891e24e27310333ba768fe8ce1789fa (updated from b317229 after the independent sticky-navigation release). Single writer: b3b0. Implementation only: not committed, migrated or deployed.

## Approved business rules

- Exclude GST from commission basis. Defaults: 25% site win plus 25% sale.
- Separate winning/selling agents, including the same agent in both roles.
- Only owner updates defaults and records payouts. Owner explicitly assigns and locks beneficiaries/current rates per sale, including historical sales after review. No automatic historical liabilities or guessed beneficiaries.
- Assigned regional agents may approve schedules without owner approval. Existing manager/owner plan access remains. A newly approved schedule awaits cleaner acceptance; uploading its signed linked agreement activates it.
- Standard sales release commission only on full confirmed payment. Accepted active plans release proportionally on confirmed allocations, including earlier deposits once, and cap at the sale commission total.
- Agent can view own commission statement independently of operational sale assignment, submit an invoice reference, and download a CSV. No other agents' balances or customer/contact records are returned.
- Payouts cover submitted commission amounts excluding GST on the agent invoice. Agent invoice submission is required before owner records a payment; partial payouts supported. These records do not transfer money.

## Implementation and exact files

- src/lib/commissionPolicy.ts: pure commission calculator and custom schedule validation.
- src/lib/commissions.ts: beneficiary-scoped reads and role-checked RPC dispatch.
- src/app/api/admin/commissions/route.ts: private reads and protected/rate-limited mutations.
- src/components/admin/CommissionsWorkspace.tsx: owner defaults/calculator/assignments/payouts; agent statements and invoice references; separate available/invoiced/paid/pending totals.
- src/app/admin/commissions/page.tsx: owner portal.
- src/app/availability/commissions/[assigneeId]/page.tsx: authenticated agent portal.
- src/components/availability/AvailabilityAgentNav.tsx: narrow commission link; deployed sticky wrapper and shared header hook preserved.
- src/components/admin/AdminNav.tsx: commission link, existing short menu labels preserved.
- src/components/admin/PaymentPlanEditor.tsx: invoice-tab checkbox, editable dates/amounts, equal-month generator, exact balance validation, replacement schedules, due/remaining amounts.
- src/components/admin/ContractSalesWorkspace.tsx: plan editor integrated before payment evidence; commissions entry for agents from Product Sales.
- src/lib/contractSales.ts: custom schedule payload; linked versioned agreements; plan-aware invoice hydration; bundles bind to the agreement's specific plan; mismatch blocks sending.
- src/lib/contractSalePolicy.ts: plan agreement wording uses schedule dates while retaining deposit-before-inspection and contract/assignment retention until full payment.
- src/lib/contractSaleInvoicePdf.ts: additional schedule pages, payment-plan due-date labels, shared preview/download/resend/bundle rendering.
- supabase/contract_sale_commissions_plans_migration.sql: forward migration described below.
- tests/commission-policy.test.mjs: calculator, schedule validation and beneficiary-scoped server reads/role checks.
- tests/integration/commission-plans-postgres.mjs: isolated PostgreSQL checks.
- tests/invoice-payment-preview.test.mjs: all schedule rows and PDF equality, plus existing invoice tests.
- tests/contract-product-sales.test.mjs: updated agreement expectation and replaced obsolete UI assertion.
- docs/commission-payment-plan-handover.md: this document.

AvailabilityAgentNav.tsx ownership was released after sticky navigation deployed. Current production baseline was integrated without overwriting commission changes, then the narrow commission link was added. Agents can enter from both their navigation and Product Sales.

## Migration and contracts

Apply after existing contract_product_sales, contract_sale_tax_invoice_workflow, contract_sale_document_bundle_workflow and invoice_email_rich_text migrations. Apply this migration BEFORE application deployment: the app selects new agreement/plan columns.

New service-only RLS tables: contract_commission_settings, contract_commission_assignments, contract_commission_claims, contract_commission_payouts. New private view contract_commission_balances and RPC manage_contract_commission. All mutations authenticate the current active staff role, and claim/payout writes serialize with sale payment confirmation. UUID request IDs enforce replay safety. Rate/beneficiary snapshots and invoice/payout evidence cannot be updated/deleted. Changes write audit entries.

Earnings use canonical confirmed allocations and immutable invoice GST/price. Cumulative rounding prevents per-receipt rounding drift. The combined entitlement rounds first, then its earned cents are split by the locked winning/selling weights. The winning share rounds to the nearest cent and the selling share receives the remainder. Both shares are monotonic under positive receipts and sum exactly to the combined entitlement. An independent review caught and corrected the earlier difference-of-rounded-components method, which could reduce a beneficiary by one cent at a rounding boundary.

Plans gain awaiting_acceptance and opening_paid_cents. Existing opening paid amount is derived from invoice total minus original schedule total, without changing payments or invoice values. Agreements gain immutable payment_plan_id. No existing agreement content or signature is rewritten. Existing legacy plans without an explicitly linked signed agreement do not enable proportional commissions until reviewed/reissued and accepted; full payment still releases commissions.

Existing create_contract_sale_payment_plan RPC now creates an awaiting-acceptance version. It preserves an active plan until the replacement's linked agreement is signed, then cancels the prior active plan atomically. Repeated identical pending schedule requests replay. Cancelled pending schedules cannot be activated by signing their obsolete agreement. Dates/amounts are validated in the app and database. Existing count/firstDueOn API payload remains supported; new optional instalments array has sequenceNumber/dueOn/amountCents. Sales workspace paymentPlan adds openingPaidCents.

New commissions endpoint GET/POST. POST actions: settings, assign, claim, payout. All caller-supplied roles/agent identity are ignored in favor of authenticated actor; owner assignments verify active agents, expected default rates and immutable assignment state. Amounts are integer cents, rates integer basis points. Agents cannot modify defaults, other beneficiary records or payouts. No dependencies changed.

## Validation

- npm run type-check: passed (generated QA route types refreshed after removing temporary local harness).
- npm run lint: passed, zero warnings/errors.
- npm test: 317 passed, zero failed/skipped.
- npm run build: passed with synthetic environment; existing Browserslist age notice only.
- git diff --check: passed.
- Isolated PGlite: migration applied twice. Real confirmation RPC exercised: manager/owner-only cleared funds, duplicate confirmations, deposit held before signed plan, activation catch-up, separate beneficiaries, protected defaults, immutable rate snapshots, request replay/mismatch, over-claim/payout rejection, partial payouts, replacement-plan activation, full standard payment, combined odd-cent rounding and anonymous denial.
- Browser: actual components via temporary synthetic-only local harness. Checked owner calculator/assignment controls, agent-only view, existing invoiced balance disables duplicate submission, payment-plan expansion, exact-cent monthly generation and successful 3-row save. Temporary harness and server removed.
- PDF: generated 24-instalment sample through actual invoice preview/resend path; tested identical PDF bytes; visually inspected invoice and schedule pages. No clipping/overlap; no misleading standard balance-due date on plan invoices.

## Release notes and limitations

No live Supabase mutation, real payout, payment recording, cleaner email or deployment performed. Full authenticated production smoke check remains for release. The isolated database test uses representative prerequisite tables plus the real new migration/confirmation RPC, not a production database clone.

Preview remains a current copy, not a historical sent-attachment archive. Submitted agent invoice references and CSV statements are provided; the app does not generate an agent tax invoice or transfer funds. Owner must explicitly review/assign each sale before commissions appear. Legacy active plans need explicit linked acceptance for proportional release. Owner account settings and agent selection use the existing PostgREST list behavior (up to provider row limit); commission financial balances/claims/payouts themselves are paginated.

Cancellation/voiding recalculates eligibility while preserving payout evidence; any paid amount exceeding entitlement is visibly marked as an adjustment/recovery requirement. The existing platform has no cleared-payment refund/reversal workflow; this release does not add one or silently delete financial records. Incorrect locked assignments/payout references likewise require a separately reviewed corrective workflow rather than editing history.

Roll forward if the migration has been used: do not drop financial tables or remove plan status values to roll back. Older application code does not understand pending acceptance, so do not revert app versions while pending plans require processing. Release must coordinate migration and app deployment after explicit authorization.

Final independent review: release coordinator re-ran the PGlite integration and four commission-policy tests, confirmed the 19-path manifest and role/migration/shared-file review, and accepted the combined-first rounding correction with no further blocker in that pass. Final integrated type-check, lint, 317-test suite, production build and diff check all pass on 2e0d549 plus this delta. Production schema/function lineage still requires release-time verification before migration. No deployment authorization has been received for this feature.
