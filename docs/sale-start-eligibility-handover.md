# Sale-start eligibility repair - combined release

User authorized fixing the failure to reserve a product for an approved cleaner and deploying it with the pending owner quote-deletion changes. No live reservation, deletion, cleaner status modification or email send is authorized or required for verification.

Read-only production inspection by release coordinator confirmed `create_contract_product_sale(uuid,uuid,uuid,text,text)` still contains `cleaner_row.compliance_status IS DISTINCT FROM 'current'`, yielding the exact error visible in the screenshot. The repository already treats compliance as advisory for approved cleaners. Production function body MD5 before repair: `58cd4d7f804e5858980cd0389fe85ffc`. Intended approved-only function body MD5 reported by coordinator: `f4a73c2a57d62a8f5f6e0186f163c1b6`.

## Changes

- `supabase/contract_sale_start_eligibility_repair_migration.sql`: restores only sale creation from the existing approved-cleaners migration. Do not replay the entire old `contract_sale_approved_cleaners_migration.sql`, which would replace the newer handover/commission/payment-plan function. New migration preserves approved-cleaner, same-state, assigned-agent, role, product availability, minimum price and idempotency checks. No records are modified by applying it.
- `src/components/admin/ContractSalesWorkspace.tsx`: shows `Starting sale...`, displays start failures next to the button, and suppresses the quote navigation link when its source was deleted. These hunks do not overlap GUI's pending invoice deep-link/load/prop changes; preserve both when integrating.
- `tests/sale-start-eligibility-repair.test.mjs`: ensures function parity with the established approved-cleaner behavior and excludes handover replacement.
- `tests/integration/sale-start-postgres.mjs`: disposable local PostgreSQL-compatible validation. Approved/not-checked and approved/current cleaners can start a sale; unapproved cleaners, wrong-state/agent, forged role and too-low price are rejected. Repeated start returns the same sale and repeatable migration preserves a handover sentinel function.

## Combined rollout

Include every file listed in `owner-quote-deletion-handover.md` plus the four files above and this handover. Apply the create-only eligibility repair and `owner_quote_deletion_override_migration.sql` before deploying application code. The latter's retained-reference insert trigger works with the restored create RPC without changing its body. Independent real-schema migration review is required; the coordinator owns production changes and release verification. Preserve current GUI invoice-directory work at integration.

No dependencies changed. No sale-start API contract change. Quote-deletion contract/schema changes are documented in the companion handover. Local full suite passes with 324 tests; local sale-start database regression passes. Production functional verification should remain read-only unless the user explicitly authorizes a specific live sale/test record.

Final local validation: type-check, lint, all 324 tests, production build and diff-check passed. Both disposable PostgreSQL integration scripts passed. Browser fixture confirmed approved/not-checked cleaner selection, disabled `Starting sale...` progress, and visible adjacent error after a simulated 409; no real sale was reserved. Source candidate frozen for coordinator integration.
