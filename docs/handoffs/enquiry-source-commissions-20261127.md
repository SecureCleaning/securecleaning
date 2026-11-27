# Enquiry-source commissions: Cove / Renata

Status: implementation complete. User authorized SC on 27 November 2026: "migrate commit and deploy the Cove commission changes through SC please, without changing any existing records or commissions." Migration/release must preserve existing business records and commissions; no historical backfill or manual corrections.

Source: b3b0/securecleaning-codex-handoff-20260331-144602. Verified baseline main and actual production alias: cd7a3b52d145e7dc96856b61d3c0c05c29bff3ac, READY dpl_5ss5mdgeXvUjtY67LA2YFiJhsXD9. Initial checkout clean. No commit/push/deploy performed here.

## User intent and behavior

- Cove Commercial Cleaning referrals pay Renata Mezedi a total 60% of contract sale income excluding GST; Secure Cleaning retains 40%. This replaces the standard combined 20% site-won +20% sale allocation, never adds to it.
- Verified Renata Team Access ID: 72bddeab-8e0e-4bb2-bee4-c48cafbeede6. Seed a new Cove rule linked explicitly to that ID. Migration fails rather than guessing if she is no longer an active agent.
- CRM enquiry-source dropdown includes configured sources. Selecting Cove fills its provider and Renata assignment; both API and transactional CRM wrapper enforce the recipient. Agents may use only their own referral sources; normal regional self-assignment validation stays in place.
- Rules live in a collapsed owner-only section at the bottom of Commissions. Owner may add a source, rename it, change its recipient/total percentage, or hide it from new enquiries. Secure Cleaning remainder is calculated automatically. Version checks reject stale saves; audit entries retain before/after.
- Each NEW sale captures a private source rule snapshot. Future settings changes do not change existing sales, commission allocations, invoices, payments, client assignments or quote records. No historical backfill.
- The original Cove-labelled manual intake is READ ONLY: a future sale from that enquiry can match its existing provider name without rewriting its source. No already-existing sale is enrolled by later status updates.
- New sources use stable referral:UUID source identifiers. Renaming rules does not break already-linked enquiries. A hidden source remains applicable to future sales of enquiries already recorded under it.
- Source recipient takes precedence over quote sender/sale creator. Standard sales retain original successful quote-sender attribution and defaults. Single 60% component uses win_bps=6000, sale_bps=0, both beneficiary IDs Renata, preserving the existing calculation/receipt engine.
- Missing/inactive source beneficiary is flagged in the existing review queue; standard-rate assignment cannot bypass the saved source rule. Owner can retry the saved rule after Team Access is resolved. Source settings do not recalculate or repair existing assignments.
- Commission statement and authorized sale screen show source information. Source rates/recipients are not added to customer documents or emails. CRM source options exclude financial values. Manager commission access remains denied.

## Files

- src/lib/commissionSourcePolicy.ts (new), commissionSources.ts (new): stable source identity, validation, scoped options, owner management.
- src/lib/clientCrmPolicy.ts, clientCrmData.ts, clientLeadCsv.ts: CRM creation/source disclosure and export/import round trip.
- src/components/admin/CommissionSourceRules.tsx (new), ClientCrmWorkspace.tsx, CommissionsWorkspace.tsx: compact source management and selection, source attribution/retry UI.
- src/lib/commissionReview.ts, commissions.ts, contractSales.ts; src/components/admin/ContractSalesWorkspace.tsx: scoped source labels, totals, review.
- tests/commission-sources.test.mjs (new), tests/commission-policy.test.mjs; tests/integration/commission-sources-postgres.mjs (new), commission-sources-browser.mjs (new).
- supabase/migrations/20261127010756_enquiry_source_commission_rules.sql (new).

## Migration and release order

Apply migration before application deployment. It creates a service-only RLS-protected commission_source_rules table, inserts ONLY the new Cove configuration, adds a nullable private sale snapshot column, and defines/updates functions/triggers/view. It makes no UPDATE/DELETE to existing business records and does not invoke an assignment backfill. Existing commission defaults remain20%+20%.

The view adds source_snapshot at the end. CRM save RPC signature is unchanged; its source-specific create branch now validates and locks the configured rule. Existing create/update/premises/idempotency paths are preserved. Additive API fields: CRM commissionSources, owner commissions sourceRules, scoped commission source labels. Additive actions source_rule.save and source_rule.retry on existing protected commissions route. No dependencies, environment variables, delivery or queue changes.

Prefer a transaction and preserve the seed safeguard. Do not run ad hoc customer corrections or invoke send/payment operations during rollout. Confirm actual live commit after deployment before syncing this checkout.

## Verification

- Type-check and lint pass.
- Full npm regression suite passes: 932 tests.
- Production build with synthetic local credentials passes; no real email/SMS keys used.
- git diff --check passes.
- Isolated PGlite migration test executes actual source-rule migration, historical attribution and commission-balance view: historical row preservation; owner-created Cove sale / different quote sender; unchanged standard split; settings and recipient future-only changes; stable IDs after rename; inactive-link flags and retries; no bypass via generic manual assignment; partial/full cleared-fund entitlement; actor restrictions, grants and service-role execution; CRM wrapper enforcement and import replay.
- Actual React browser fixtures exercise collapsed bottom-of-page controls, edit percentage with reciprocal company preview, adding a different source, and CRM Cove selection/locked Renata. All API writes mocked and non-local network blocked. Screenshots /tmp/cove-commission-rules.png and /tmp/cove-crm-source.png are synthetic (the edit test changes fixture Cove to55%; the production seed is60%).
- React review: state stays in the settings component; no new effect loops; explicit labels, disabled pending controls and live status; server-side owner checks and agent scoping, no financial rule leakage to CRM options.
- No live record writes, test customer records, email/SMS, calendar actions or production migration. Production schema read-only check confirms new table/column absent before release. Authenticated live new-UI verification necessarily awaits deployment.

Reproduce database fixture: PGLITE_MODULE=/private/tmp/sc-cove-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/commission-sources-postgres.mjs (test-only pinned pglite0.3.14 installed outside repository).
Browser fixture: ESBUILD_MODULE=/Users/lyle/.npm/_npx/67eb4586ca667318/node_modules/esbuild/lib/main.js PLAYWRIGHT_MODULE=/Users/lyle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node tests/integration/commission-sources-browser.mjs.
