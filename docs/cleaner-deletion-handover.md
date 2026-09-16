# Cleaner administration handover - 2026-09-16

Baseline: 6a1e346, assigned b3b0 worktree. No commit or deployment performed.

## Completed production status update

User explicitly requested approval of imported non-rejected cleaners and authorized use of the earlier backend configuration. Read-only review found 532 records: 530 imported CSV legacy records (529 leads, one rejected), plus two non-imported records. Updated only the status field of the 529 imported leads using exact IDs, previous status and updated_at concurrency guards. Verified 529 target approvals; all three excluded records remained identical. Final totals: 530 approved, one rejected, one lead. No email was sent and no suppression preferences were changed.

Non-sensitive audit reference: admin-improvements-20260916-imported-approval.
Actions: cleaner.imported_approval.requested and cleaner.imported_approval.completed. Do not repeat this data update during release.

## Deletion candidate

Changed files:
- src/app/admin/cleaners/page.tsx
- src/app/api/admin/cleaners/[cleanerId]/route.ts
- src/components/admin/CleanersAdmin.tsx
- src/lib/cleanerAdminAuth.ts
- src/lib/cleaners.ts
- tests/cleaner-admin-security.test.mjs
- tests/cleaner-deletion.test.mjs
- supabase/cleaner_permanent_deletion_migration.sql
- docs/cleaner-deletion-handover.md

New DELETE endpoint requires a signed manager/owner session, UUID, matching cleanerId and literal DELETE confirmation. Agents, viewers and staff cannot delete; no regional-agent deletion route is introduced. The page derives button visibility from the server session. Existing contracts remain unchanged; the DELETE response adds success/deleted.

The service-role-only, SECURITY INVOKER RPC locks the cleaner row, rejects attached documents, writes a minimal non-contact audit record and deletes the cleaner in one transaction. Existing RESTRICT references protect sales, offers and broadcast history. Direct cleaner email history, comments and cleaner-specific broadcast suppression records cascade under the existing schema; global email suppressions and admin audit history remain. Storage is not touched: uploaded documents must first be removed through the existing document workflow. Repeated deletion returns deleted=false. Deletion does not create a permanent registration/import ban.

Apply cleaner_permanent_deletion_migration.sql after cleaners_migration.sql, cleaner_documents_migration.sql and audit_log_migration.sql, before deploying the route/UI. Review existing contract product/sales foreign keys before release. No production migration was executed; later disposable synthetic SQL validation is described below. Code rollback removes the action; unused RPC can remain or be dropped separately. Deletion itself is irreversible through the application and cannot be undone by rolling back code.

## Correspondence findings

Rejected is not a universal do-not-contact flag. Contract broadcast selection and the recipient-claim SQL require approved status and check suppressions. Direct cleaner emails and profile-update invitations do not require approved status. Sale inspection invitations and prepared agreement/document delivery do not uniformly recheck cleaner approval; invoice issuance does require it. Arbitrary-address email workflows are not a cleaner-status suppression system. These behaviours were reviewed, not changed. Do not promise that rejected cleaners can never receive correspondence. Existing queued/in-flight/provider-accepted messages cannot be recalled by changing a status.

## Original deletion-only evidence

At the original deletion-only checkpoint, canonical rich-email hunks had only been inspected, dependency manifests were unchanged, no disposable SQL database had been used, and the suite passed 247 tests. These are historical facts about that checkpoint, not the current combined candidate.

Manual verification at that checkpoint: authenticated live cleaner directory inspected before/after the authorized approval update; backend aggregate and excluded-record verification completed. No production deletion was attempted.

## Current combined candidate reconciliation and validation

The subsequent user request restored rich-email hunks selectively and integrated deletion with the shared CleanersAdmin/cleaners library changes. Package manifests and lockfile now include editor/sanitizer dependencies. See email-composer-handover.md for current contracts, migration order and the exact combined file manifest; see email-dependency-audit.md for baseline/candidate attribution.

Disposable in-memory PostgreSQL validation now passed using synthetic prerequisite tables: deletion blocks documents and RESTRICT-linked sales, failure rolls back audit/deletion together, successful deletion retains batch/audit ledger. The migration was applied twice. This is not validation against the target schema and does not establish production concurrency behavior.

Remaining deletion gap: the local authenticated deletion UI confirmation/error/success flow has not been manually exercised. No production deletion smoke test was run. Target-schema/FK review and authenticated UI verification remain release gates. Automated tests cover role boundaries, malformed confirmation/IDs, signed actor attribution, repeat deletion, safe linked-record/document error responses and structural safeguards.

Current combined validation: npm run type-check PASS; npm run lint PASS; npm test PASS (262 tests); npm run build PASS using synthetic Supabase settings; git diff --check PASS. Existing SWC-minifier/Browserslist warnings remain. These results establish local candidate validation, not release clearance. No commit, deployment or production migration was performed.
