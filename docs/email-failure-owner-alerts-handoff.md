# Owner email failure alerts

Ready for release review; not deployed by this task. User request: "please also put in place an error notification email if sending emails fail to owner". On 4 November 2026 the user subsequently authorized release: "deplot through sc". Route the project-wide commit, migration and deployment through SC Deploy.

Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Verified production/main baseline: `f691683d4e235102973faaa90d2550bc72d55760` (Ready deployment's build logs explicitly name f691683). Checkout was clean before this work. Changes are uncommitted and editing is complete.

## Behavior

- Central email sending records provider rejection, configuration failures, network uncertainty and missing provider acknowledgement. Both sending helpers share the path. Original error classes remain intact for existing reconciliation logic.
- Partner appointment notification preparation is covered too, including invalid calendar mailbox/attachment failures before any provider send. Existing review-required states remain unchanged.
- The owner receives an email with subject, intended recipients, detection time and safe failure category. It explains uncertain delivery and warns that another message in the same workflow may have succeeded. Raw exceptions, email bodies, attachments and capability/idempotency tokens are not copied into the alert.
- Owner destination uses the existing `ADMIN_EMAIL`, trimmed, defaulting to `info@securecleaning.com.au`. Invalid addresses leave alerts queued. Alert sender is the existing verified `Secure Cleaning <quotes@securecleaning.com.au>`, independently of the original message's sender.
- Private outbox deduplicates by original logical idempotency key and failure category; without a key it deduplicates the same subject/recipient/sender/category within a UTC day. Distinct failures may produce distinct alerts.
- First delivery is attempted immediately. Retries use the existing authenticated notification worker at `/api/sms/worker`, independently of SMS's enabled state. No SMS sending, scheduling or retry logic changes.
- Alert payload and owner recipient are frozen. Claims use row locking, bounded batches, expiring leases and a lease token on completion. Retries wait five minutes and use the same provider idempotency key. After 23 hours from the first attempt, an unresolved alert moves to manual review to avoid duplicate delivery outside Resend's 24-hour window.
- A generic, non-dismissable admin dashboard warning shows queued/review alert count or unavailable monitoring, linking to Resend. No recipients or email contents are exposed through this warning. It disappears when no alerts need delivery/review.
- Reporting failures never replace the original application error, recursively generate alerts, automatically resend original messages, or modify bookings/payments. Development and preview runs do not create or send owner alerts.

## Files

- `src/lib/emailFailureAlerts.ts`: new outbox recording and non-recursive delivery.
- `src/lib/email.ts`: central sending instrumentation and shared sending path.
- `src/lib/partnerAppointmentMessages.ts`: preparation failure reporting.
- `src/app/api/sms/worker/route.ts`: drain alert outbox alongside existing worker.
- `src/lib/alerts.ts`, `src/lib/adminOverview.ts`, `src/components/admin/AlertsPanel.tsx`: generic dashboard warning and additive alert kind.
- `supabase/migrations/20261104061109_email_failure_owner_alerts.sql`: private table and service-role claim RPC.
- `tests/email-failure-alerts.test.mjs`, `tests/partner-appointment-requests.test.mjs`, `tests/quote-email-cc.test.mjs`: behavior tests and dependency mocks.
- `scripts/test-email-failure-alerts-database.mjs`: isolated SQL verification.

## Release requirements

1. Reverify live/main and reconcile only these intended changes with concurrent work.
2. Apply `20261104061109_email_failure_owner_alerts.sql` before deploying the application. It is additive and repeatable, creates no historical alert rows, and changes no existing records. RLS enabled; table and invoker RPC denied to PUBLIC/anon/authenticated, granted only to service_role. No existing workflow tables, triggers or functions changed.
3. Existing environment required: `ADMIN_EMAIL`, `RESEND_API_KEY`, database credentials and scheduled worker authentication. No new environment keys, package dependencies or public endpoints. The existing `secure-cleaning-sms` cron was confirmed read-only as active with `* * * * *` on 4 November 2026. Keep that schedule active even if SMS sends are disabled.
4. Verify the migrated table/RPC grants, production build and authenticated dashboard warning. Do not trigger the live worker as a smoke test: it can send pending real notifications. Do not deliberately send a failed live email without explicit test authorization.
5. No historical replay/backfill. In particular, leave the existing appointment request marked review-required; do not resend customer/agent messages or alter bookings.

Data/API changes: new private `email_failure_alerts` table and `claim_email_failure_alerts(text,integer,uuid)` RPC; additive `email_failure` admin alert kind. Existing route responses and normal send payloads unchanged. A provider response without a message ID now raises uncertain-delivery instead of appearing successful.

Rollback: revert application integration if needed; retain the private additive table for audit/queued alerts. Do not drop it or replay stored/original messages automatically.

## Verification

- `npm run type-check`: PASS.
- `npm run lint`: PASS, no warnings/errors (existing Next CLI deprecation notice only).
- `npm test`: PASS, 781 tests.
- `npm run build`: PASS with harmless database placeholders; no production credentials used by the build.
- `git diff --check`: PASS.
- Isolated PGlite migration: PASS. Checked table/RPC privileges and RLS, invoker/search_path, anonymous denial, duplicate insertion, exclusive claims, retry backoff, frozen recipient/text, stale-worker fencing, 23-hour review cutoff, bounded batches, sent-row exclusion and repeat application preserving existing alert rows.
- Provider tests use mocked fetch/SDK only: no live emails/SMS, resends, payments, settings or bookings changed. No authenticated live browser test performed for this unreleased feature. Production read-only check confirmed existing cron activation.

Operational limits: sending-time failures are covered; later bounces after provider acceptance remain in existing provider delivery history and are not a new webhook feature. An email-provider outage can delay the alert itself, which stays queued and visible on the admin dashboard. A database outage can prevent durable recording; safe server logging remains, and dashboard monitoring reports an unavailable connection when it can load. Review-state alerts require operator reconciliation rather than automatic replay. Changing fixed alert sender/subject formatting in future needs care while idempotent retries are pending.

Production access note: the stored Management API helper returned HTTP 401 during the read-only cron check. The connected Supabase tool succeeded. Use the working connector for release checks/migration; no credentials were printed or modified.
