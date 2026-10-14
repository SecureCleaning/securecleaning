# SMS due-work release - 14 October 2026

## Scope and behavior

Base: origin/main b497397138c955fd178aef3146d63c9bb411b3db. The original dirty
checkout is preserved; implementation uses an isolated worktree.

The existing minute cron now performs indexed database checks. It calls the
existing authenticated worker only for queued/unknown jobs whose due date has
arrived, expired job leases, due submitted-message reconciliation, pending
provider opt-out sync, pending operational alerts, or a maintenance run after
15 minutes without worker activity. An active worker lease suppresses wakeups.
Lost HTTP wakeups retry on the next tick; no durable job is marked sent merely
because an HTTP request was queued. Dispatch leases, provider idempotency,
unknown-outcome reconciliation and signed webhooks are unchanged.

Completely idle minutes incur no worker HTTP request, Vault reads, or settings
updates. Approximately four maintenance runs/hour remain to recover missed
webhooks: roughly 36 database API requests and 12 settings writes/hour versus
540 requests and 180 writes with 60 runs/hour, under the previously measured
nine-request/three-write idle path. Cron reads/run-history bookkeeping remains.
Actual counts vary with jobs, alerts, failures, and minute-boundary rounding.
Missed inbound webhook recovery can take about 15-16 minutes while idle; signed
STOP webhooks remain immediate, and every due-work run still checks inbound
history before dispatch. Delivery reconciliation retains its hourly cadence.

A stale-worker alert requires work overdue by ten minutes plus a stale heartbeat;
idle maintenance is not overdue until about 25 minutes. UI/activation freshness
limits now match that idle allowance. Monitoring cannot report a stopped cron
from inside the stopped cron itself; existing external monitoring still matters.

New automatic quote notifications have a five-minute minimum/default, then
existing local weekday 09:00-18:00 rules. The narrow preflight confirmed live
settings already use five minutes. Existing due dates and messages are untouched,
including any old messages scheduled under earlier settings. Longer configured
delays remain allowed. Final quotes anchor to persisted provider acceptance;
online estimates anchor to successful provider-receipt recording (so delayed
persistence can delay SMS further). Existing enqueue dedupe and email-acceptance
persistence failure behavior are unchanged; no historical messages are backfilled.

## Files and contracts

- supabase/migrations/20261014031331_sms_due_work_gate.sql: forward migration,
  existing sms_tick replacement, six partial indexes, five-minute default/minimum.
- src/lib/smsData.ts: matching settings validation and idle freshness allowance.
- src/components/sms/SmsSettingsAdmin.tsx: matching minimum, status and recovery text.
- tests/sms-security.test.mjs: minimum-delay and activation regression tests.
- scripts/test-sms-due-work-database.mjs: isolated PostgreSQL gate tests.
- This report.

No dependencies, credentials, auth rules, RLS policies, grants, cron frequency,
provider send code or webhook contracts change. sms_tick retains its existing
restricted execution grants and fixed search path. No new functions are exposed.
The settings API rejects delays below five minutes. Migration updates only
settings below five; it does not update sms_jobs or automation enablement.

## Validation

- npm run type-check: passed.
- npm run lint: passed (existing next lint deprecation notice).
- npm test: 565 passed, no failures/skips; existing transport tests require local
  loopback permission. The initial sandboxed run failed on that restriction.
- npm run build: passed with SMS disabled and local placeholder configuration.
  Initial environment-free build failed
  for missing public Supabase configuration; local retry uses non-production
  placeholders and SMS disabled. The staged Vercel build uses existing production
  configuration without copying production secrets into this checkout.
- git diff --check: passed.
- Existing SMS and quote-SMS PostgreSQL suites: passed.
- New PostgreSQL suite: passed, including zero idle writes/HTTP/Vault access,
  five-minute final/estimate eligibility, existing schedule preservation, replay,
  ACL preservation, due/unknown jobs, expired leases, competing claim attempts,
  lost wakeups, active-worker suppression, hourly reconciliation, STOP sync,
  terminal jobs, maintenance and stale-alert thresholds/dedupe, business hours/DST.
- Existing mocked worker tests cover uncertain provider outcomes, reconciliation,
  signature verification and pre-send readiness without live messages.

PGlite serializes connections: competing-claim tests do not establish independent
multi-session PostgreSQL concurrency. The existing worker/claim lock SQL is not
changed. No real customer SMS/email, payment, or synthetic production job was sent.
Authenticated UI manual testing and real carrier delivery are not part of this run.

## Compatible rollout and recovery

1. Recheck origin/main and live Vercel target; integrate/retest any intervening work.
2. Commit this feature only; build a staged production deployment without domains.
3. Review exact installed sms_tick, matching migration history and settings. Apply
   only this forward migration to qhqbthnpzsnnzfannvyl; do not replay other migrations
   whose installed timestamps differ. The existing live worker is compatible.
4. Verify function/default/constraint/index/ACL metadata. Fast-forward main, then
   publish the tested commit to securecleaning.com.au. Recheck concurrent deployments
   before promotion; never replace a newer release with this older checkout.
5. Verify domain deployment commit and no-write public/auth-rejection checks. Observe
   scheduled ticks, safe job-state counts and worker timestamps without invoking a
   worker, creating jobs or sending test messages. A live due job may be absent;
   use local synthetic tests for dispatch timing rather than inventing production
   work. No broad cancelled diagnostic SQL is resumed.

Backout: preserve queued messages and provider idempotency records. A reviewed
forward restoration of the previous sms_tick body can restore minute wakeups
without replaying old migrations or weakening the five-minute constraint. UI/API
can revert independently because the schema is backward-compatible for valid
settings. Prefer restoring only this feature instead of rolling back an entire
website deployment that might remove intervening work. No rollback is automatic.
