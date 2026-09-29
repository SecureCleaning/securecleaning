# Secure Cleaning SMS workflow

## Release boundary and baseline

Before SMS implementation, the existing website changes were reconciled with current production, tested (387 tests plus types, lint and build), committed as `d26b95d`, and deployed to the linked Vercel project `openclawsecurecleaning`. Production deployment: `dpl_J7BwNEJxJxdAo9T39k9bQTUMxJgR`. All original uncommitted work was preserved; the old checkout's complete checkpoint is on `codex/pre-sms-checkpoint` (`ad9abe2`).

SMS implementation is isolated on `codex/sms-workflow`. No SMS credentials, credits, provider configuration, live SMS or production SMS migrations were created during implementation. Automatic sending defaults OFF, and a separate server switch defaults OFF. No new application dependencies.

## Staff experience

- Owner: `/admin/sms`, linked from the dashboard's **SMS replies** box. Templates, five-minute delay, segment limit, estimated price, automatic follow-up switch, connection status, dedicated number, balance and worker health.
- Alert recipient defaults to **info@securecleaning.com.au** and is editable only by an active owner. Low-credit, delivery failures, uncertain outcomes and other operational errors are persisted and emailed through an idempotent alert outbox. Replies also raise a private operational notification. Emails contain safe codes and references, not client message text or credentials.
- The quote workbench has **SMS reminders and replies**: consent evidence, delivery history, pending cancellation, replies and a manual message composer. Preview shows the exact recipient/message, segments, estimated cost and local send time. Confirmation is mandatory; preview signatures expire after five minutes.
- Regional agents can read/send only for quotes they can access under the existing region/CRM-assignment policy. Owner/manager can access quote SMS; only owner can change settings or test recipients. Every API rechecks the active staff account and quote access.
- Owner and regional dashboards show a compact unread-reply box. Regional replies are filtered by current quote access. Unmatched/deleted-quote replies stay owner-only. Replies such as "I haven't received the quote" link back to the quote for a staff response. Reading a reply does not send an email or SMS automatically.

## Rules and sequence

1. Existing staff final-quote email paths submit to Resend. The existing successful send-attempt record must contain a provider message ID.
2. A database trigger inserts one automatic SMS job per final quote version, in the same transaction that records email acceptance. This confirms submission to Resend, not delivery to the inbox. Email status remains separate.
3. Due time = accepted time + configured delay (default five minutes), moved to **9am on the next weekday** if outside **Monday-Friday, 9am inclusive to 6pm exclusive**, in the client's Sydney/Melbourne timezone. Daylight saving is handled. Weekends are excluded; public holidays are not separately excluded.
4. A persistent database queue is polled every minute by Supabase Cron calling a short authenticated Vercel worker. No browser timer or five-minute open request. At this site's low volume, delivery submission is approximately five to six minutes after email acceptance during permitted hours. The bounded worker processes two due messages per invocation; backlog adds delay.
5. Immediately before sending, a transactional dispatch check revalidates the quote/version/expiry/mobile, final-email acceptance, consent, opt-out, automation switch, quiet hours and duplicate/cooldown rules.
6. The worker freezes the exact payload, credential-scope hash and UUID idempotency key before the provider request. It records provider acceptance separately from delivery. Multipart receipts are aggregated; any failed part keeps the message failed even if receipts arrive out of order.
7. Signed inbound webhooks persist replies, mark STOP/clear unsubscribe requests, cancel pending reminders and queue provider suppression sync. Provider unsubscribe blocking is never bypassed. Read-only inbound polling recovers missed webhooks from the last successful polling date with a one-day overlap. More than 200 pending historical replies suspends dispatch and raises an owner-review alert instead of silently skipping messages.

Defaults/exceptions:

- Initial automatic purpose: staff-issued final quotes, including authorised regional sends. Public online estimates and ordinary manual email resends do not create jobs. Repeated final-send requests for the same version cannot create a second automatic job.
- No implied bulk backfill when enabling: only future successful submissions create jobs. No retrospective import of earlier quote emails.
- SMS permission is explicitly recorded with evidence. Missing permission, invalid/landline numbers and unknown service timezone are skipped. No existing client is silently opted in.
- A revised quote cancels the older pending reminder; a newly emailed version can qualify. Automatic recipient cooldown is 24 hours to avoid multiple quote reminders to the same phone. Manual support messages have a one-minute cooldown and require preview/confirmation.
- Manual messages replace a never-submitted automatic reminder for the same quote/version. Outstanding uncertain submissions block new messages to the same number. Manual action is not a way around opt-out or closed/expired quotes.
- Accepted, withdrawn, deleted, superseded, expired, declined and cancelled quotes are suppressed. Pending cancellation is immediate in the database. Once a carrier/provider submission has started, it cannot reliably be recalled; cancellation then prevents a retry and the original outcome is reconciled.
- A reminder over 24 hours past its due time, or over seven days old, is skipped. Turning automatic follow-up off cancels its pending jobs. The server switch stops all outbound SMS; inspect pending jobs before turning it back on.
- Renewed consent after a STOP requires owner/provider review; the UI cannot casually erase a suppression.
- Tests require owner access, an explicit recipient, confirmation and the server test-recipient allowlist. They also obey weekday hours.

## Reliability and security

Mobile Message supports scheduled sends, but this release keeps the delay in the application queue. That makes cancellation, quote revalidation and audit history authoritative in one database. Provider scheduling is not used.

Provider idempotency keys last 24 hours and are scoped to an API key. After an uncertain request, first look up the existing custom reference. Replay only the identical payload/key, in the same credential scope, inside a conservative 23-hour window, while the quote remains eligible, with at most three attempts. Otherwise mark **review** and alert. Never generate a fresh key to recover an unknown outcome. An owner can use **Check provider status** to reconcile without resending. No provider record is not proof of non-delivery; unresolved cases require account review/contact with Mobile Message.

Definitive provider rejection is failed, not delivered. Rate limits and uncertain/network errors have bounded retries. Database failures after provider acceptance retain the original idempotency key. Delivery webhooks received before the HTTP response cannot be overwritten by a later submitted status. Worker leases recover from terminated functions and a singleton lock prevents overlapping workers.

Webhook authentication verifies the HMAC over the raw body and timestamp (five-minute replay window) using constant-time comparison. Duplicate event keys are ignored. Event numbers and original references must match. Only safe status fields and required message history are stored; raw API errors and credential headers are never logged or exposed.

All SMS tables have RLS enabled and no anonymous/authenticated browser grants. Service-role access is server-only. Settings and consent edits are transactional with audit-log writes. The jobs record purpose, business entity, actor, version and provider reference; future appointment SMS can use this infrastructure but must add their own consent, recipient, cancellation and role checks. No appointment SMS trigger is enabled by this release.

## Files and contracts

- `src/lib/smsPolicy.ts`: formatting, AU numbers, weekday/DST policy, supported fields and segment counts.
- `src/lib/mobileMessage.ts`: server-only provider adapter, connection checks and webhook authentication.
- `src/lib/smsData.ts`: staff/region permissions, settings, consent, preview signatures, history and manual queueing.
- `src/lib/smsWorker.ts`, `smsEvents.ts`, `smsAlerts.ts`: delivery/reconciliation, replies/receipts and email alert outbox.
- `src/components/sms/*`, `/admin/sms`: settings, quote panel and staff inbox; embedded in existing quote editor and owner/agent dashboards. Existing saved navigation layouts are preserved.
- `/api/staff/sms`: private, no-store GET views (settings/quote/inbox), POST settings/connection/preference/preview/send/read/cancel/reconcile actions. Existing APIs remain unchanged.
- `/api/sms/worker`: secret-authenticated POST, Node runtime, 60-second cap.
- `/api/sms/webhook`: HMAC-authenticated POST; only production accepts callbacks.
- `supabase/sms_workflow_migration.sql`: six private tables, indexes, queue/dispatch/event/settings RPCs and quote lifecycle triggers.
- `supabase/sms_scheduler_migration.sql`: optional activation migration for pg_cron/pg_net, Vault-backed worker call and stale-worker alert recording.
- `supabase/data_api_explicit_grants_migration.sql`: maintained inventory includes the six new tables. The forward SMS migration itself grants service-role access, so the inventory migration need not be rerun on an existing installation.
- `.env.example`: server-only configuration names; no values.
- `tests/sms-policy.test.mjs`, `tests/sms-security.test.mjs`, `scripts/test-sms-database.mjs`: isolated business, security, failure and PostgreSQL checks.

## Setup and rollout order

1. Review/apply `sms_workflow_migration.sql` after the existing final-quote and CRM/audit migrations. Verify browser roles cannot access the tables/RPCs. Existing quote/email APIs do not need contract changes.
2. Deploy application code to the linked **openclawsecurecleaning** project with `SMS_LIVE_SEND_ENABLED=false`. Confirm existing quotes, CRM and email actions still work. The SMS settings page should show automation off.
3. In Vercel's **Production** environment, enter `MOBILE_MESSAGE_API_USERNAME`, `MOBILE_MESSAGE_API_PASSWORD`, `MOBILE_MESSAGE_SENDER` and `MOBILE_MESSAGE_WEBHOOK_SECRET` directly. Do not put them in chat, source files or the admin UI. Use a dedicated Mobile Message number approved on the account; alpha IDs and own-number senders are deliberately unsuitable for this reply-based workflow.
4. Configure both provider webhook types to `https://securecleaning.com.au/api/sms/webhook` and configure the matching signing secret in Mobile Message. Check connection from settings; it makes GET requests only and never registers/purchases a number.
5. Generate a strong random `SMS_WORKER_SECRET` and configure it in Vercel and Supabase Vault (`sms_worker_secret`). Store the exact worker URL in Vault as `sms_worker_url`. Use the dashboard's secret fields, not SQL literals in saved query history.
6. Enable the pg_cron and pg_net extensions and apply `sms_scheduler_migration.sql`. Discovery found the project on Vercel Hobby, with no existing cron; Hobby's daily-only native cron cannot provide this delay. Supabase Cron provides the minute trigger without requiring a Vercel plan change. No plan upgrade or credit purchase is part of this implementation.
7. Add only staff-controlled test phones to `SMS_TEST_RECIPIENTS` (comma-separated `614XXXXXXXX`). Confirm the worker heartbeat, approved dedicated sender, both callback URLs, signing and balance. Set the server switch true for controlled tests, keeping automatic follow-up off. Redeploy when changing environment variables.
8. Conduct the handset tests below with explicit consent. Only after they pass, use the owner settings switch to enable automatic follow-up. No other business SMS purpose is activated.

Rollback: turn automatic sending off to cancel pending reminders. Set the server switch false to stop all SMS. Disable the named `secure-cleaning-sms` cron if necessary. Keep history, preferences and events; do not drop them or reset idempotency keys. Existing quote/email behaviour remains independent while the automatic setting is off.

## Validation and operations

Automated validation includes the existing full suite, type-check, lint, build and diff whitespace check. A local, disposable PGlite instance validates migration replay, RLS/ACLs, email acceptance trigger, duplicate suppression, cancellation, consent, manual idempotency, leases, credential rotation, out-of-order multipart receipts, atomic audits and optimistic settings updates. Test runtime is installed outside the repository; no production database or provider is used.

Implementation checks: all 402 tests, type-check, lint, production build, PostgreSQL integration checks and whitespace checks passed. The build used placeholder Supabase environment values and a 3 GB Node heap after a lower-memory run exhausted its heap. The settings layout and expandable controlled-test form were visually inspected using locally rendered components with fictional data. This was a visual check, not an authenticated browser end-to-end or handset test; those remain activation prerequisites below.

Reproduce PostgreSQL checks with a temporary installation of `@electric-sql/pglite@0.3.14`, then set `PGLITE_MODULE` to its `dist/index.js` and run `node scripts/test-sms-database.mjs`. Core migration is tested; scheduler extensions/Vault/network execution require staging/production verification and cannot be simulated by PGlite.

Controlled handset checks still required before activation:

- One permitted staff test: correct sender/text/segments, provider receipt and reply visible on quote/dashboard.
- STOP: no subsequent sends, pending reminders cancelled, provider suppression synchronised.
- Failed final email: no job. Successful final email: one job after delay. Retried send/resend: no duplicate.
- Accept, revise or delete before due time: cancelled. Friday evening/weekend: next Monday 9am local; DST boundaries verified by automated tests.
- Regional agent cannot open another region's history, alter global settings or test arbitrary recipients.
- Disable switch and rotate credentials with a pending uncertain job: no replay. Provider outage and low credits: visible history plus email to configured recipient.
- No real clients in automated fixtures; preview builds cannot send. Keep preview Supabase data isolated from production.

A failed alert email stays pending; an uncertain alert older than the Resend idempotency window stays in review rather than being duplicated. The settings page exposes these cases. If the whole application/database is unavailable, it cannot deliver its own outage email: the scheduler records a stale-worker alert for recovery and external uptime monitoring remains advisable.

Operating load: a minute worker is about 43,200 function invocations per 30 days, plus database/provider reads, actual SMS credits and Resend alert emails. Set cost indication to the account's actual price; the default is an estimate of 4 cents per segment ex GST, not a billing promise. This does not purchase credits or a dedicated number. Monitor Vercel/Supabase usage and database uptime; free-tier pauses/outages affect the queue. Review retained sensitive messages under the business retention policy. Supabase cron run history also needs routine retention maintenance.

Official references checked during implementation:

- [Mobile Message API](https://mobilemessage.com.au/api-documentation) and [OpenAPI schema](https://mobilemessage.com.au/assets/openapi.json)
- [Provider idempotency](https://help.mobilemessage.com.au/api/api-idempotency-keys)
- [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart)
- [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
