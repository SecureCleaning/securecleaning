# Inspection SMS confirmation wording and timing

17 November 2026. User requested removal of the awaiting-confirmation SMS and replacement of the product-sale inspection wording with their exact cleaning site induction message. This supersedes the pending-request behavior in the earlier inspection SMS handoff. Deployment has not been requested for this revision. No live email/SMS or production mutation has been performed.

## Source and scope

- Checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`
- Branch: `codex/client-deletion-booking-lineage-20260924`
- Clean verified baseline: `590e901f2c613c55a133fef56fe8427a62daa655`.
- Fetched main matched the live Ready production alias: `dpl_BQCG2zQBPUU3dW7rTHzndnakrmLR`, project `openclawsecurecleaning`, scope `lyles-projects-1cf7cd8c`. Source commit was read independently from deployment metadata.
- SC Deploy ownership notice sent before editing. Only this revision's files are changed.
- Read-only production check found no inspection-request, inspection-confirmation or sale-inspection SMS jobs at the time of development.

## Behavior

Initial site-visit SMS now queues only after an accepted confirmed-appointment email. Public pending site requests and partner alternative-time requests continue to receive their existing emails, but no SMS. Partner confirmations still produce one SMS; declines do not. The initial confirmed-visit wording is unchanged.

The sale-inspection SMS uses this exact text:

> Secure Cleaning: We've emailed your cleaning site induction confirmation. Please let us know if you need to change it. Check your inbox/junk folder for details. Reply STOP to opt out.

This is two GSM segments and fits the currently configured maximum of two. It still triggers on the client inspection invitation email, not sale completion. Recipient selection, opt-out/email-only safeguards, delay, quiet hours, duplicates, owner alerts and provider reconciliation remain unchanged. No new service or credentials are needed.

## Files and rollout

- `src/lib/email.ts`: confirmed booking email gate.
- `src/lib/partnerAppointmentMessages.ts`: confirmed decision gate; pending/decline emails unchanged.
- `src/lib/inspectionSms.ts`: confirmation-only TypeScript input.
- `src/components/sms/SmsSettingsAdmin.tsx`: explain confirmed-only behavior and site induction wording.
- `supabase/migrations/20261117030329_inspection_sms_confirmations_only.sql`: forward migration, apply before app release. Never edit/replay the already-applied original migration.
- `tests/inspection-sms.test.mjs`: update existing delivery tests and segment assertions.
- `scripts/test-inspection-sms-database.mjs`: add forward-rollout cases using actual SQL functions and synthetic records.
- This handoff.

The migration replaces only `sms_record_inspection_email` and `sms_inspection_block_reason`. Their signatures and service-only access remain unchanged. A request receipt from an older app instance becomes a successful no-op, avoiding both queueing and false failure alerts during rollout. New confirmation receipts retain existing checks.

The migration cancels only never-submitted pending request SMS jobs in `queued`/`leased` state. Sent and uncertain-provider history/payloads are preserved. The dispatch guard rejects request receipts if an old job reaches it later. Existing induction job wording is not rewritten, avoiding alteration of frozen retry payloads. No booking, client, email or payment records are changed. No notifications are sent by the migration.

Before replacement, the current live receipt function MD5 was `5af474c5ee525f971bfb90da6638b6f3`, matching the original repository migration. Recheck current production and any concurrent changes before integration. There are no public API, schema-column, dependency or environment changes.

## Verification

- Type-check: passed.
- Lint: passed, no lint warnings/errors apart from the existing Next lint command deprecation notice.
- Full tests: 852 passed, 0 failed; includes the six focused inspection SMS tests.
- Isolated PostgreSQL/PGlite tests: passed, including legacy queued/leased cancellation, sent/unknown history preservation, old-app request no-op with no receipt/job, later confirmation deduplication, exact induction wording, private grants, existing quote behavior and SMS safeguards.
- Production build: passed with synthetic credentials.
- `git diff --check`: passed.

Test commands: `node --experimental-loader ./tests/ts-loader.mjs --test tests/inspection-sms.test.mjs`; `PGLITE_MODULE=/tmp/sc-inspection-sms-tools/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-inspection-sms-database.mjs`; standard repository validation scripts. Build uses synthetic credentials. PGlite remains installed only under `/tmp`, not in repository dependencies.

Manual verification is limited to source/diff review and read-only production metadata/function/job checks. No browser save or live delivery test was performed. Release coordination and a separately authorized live send, if desired, remain outstanding.
