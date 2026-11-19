# Background cleaner email delivery — ready for SC Deploy

User authorization: “please fix this so emails send in the background without keeping the page open, and make sure anything already sent is not sent again. once tested deploy through SC please.”

Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Verified baseline: `7bc788191d1f7a7feba94c8c6bb0ab0cdbe48930`, READY production `dpl_4VpXsitMz39W8Df1jTME1cVmTURR`; Vercel production build log identifies main commit `7bc7881`. Started clean. Pre-handoff recheck still shows main and READY production at the same commit. SC Deploy owns integration, commit, migration, secrets and deployment. No dependencies changed.

## Result

Both contract-product broadcasts and the cleaner email composer persist explicit background jobs. A Supabase Cron/pg_net wakeup invokes the authenticated Node worker every 15 seconds. Each invocation claims one job with a two-minute lease and processes at most ten queued recipients within the existing bounded delivery window and shared 600 ms provider pacing. Browser Send/Continue endpoints now only enqueue, while polling uses read-only status actions. Closing a tab or composer does not control delivery. History shows background/paused/review states and offers explicit resume of owned saved requests.

## Current live broadcast — do not touch

Read-only production audit during implementation confirmed campaign `9cf7e9c2-3399-4a9c-82a8-21f1c4d64204` is **completed, 401/401 sent, zero queued, no lease**. Earlier intermediate counts are obsolete. This release must **not enroll or resume this campaign or any other existing campaign**. The migration contains no backfill. Verify the new background ledger remains empty during migration/health checks. Historical interrupted campaigns are deliberately not automatically discovered or resumed.

## Delivery safety

- Existing per-recipient atomic claims, suppression/eligibility checks, campaign ownership and regional checks remain authoritative. The worker reloads the original actor's active account and current region each time; sender permission/signature checks still run.
- Only `queued` recipient rows can be claimed. Sent, rejected, skipped and unknown outcomes are never reset by this implementation.
- Stale in-flight claims become unknown, never queued. Provider acceptance with failed DB finalization is held as unknown. No automatic resend/reconciliation of uncertain recipients.
- Each message also uses a stable Resend key (`cleaner-broadcast/<recipient UUID>` or `cleaner-email/<email UUID>`). Resend retains keys for 24 hours; persistent DB terminal outcomes protect against replay beyond this window. Safety does not depend on retrying uncertain sends within the provider window.
- Only explicit provider rate/quota rejection permits a return to queued (definite non-acceptance). Quota pauses the job until explicit resume. Three consecutive processing failures hold it for review. Errors never copy raw provider payloads or private message content into job logs.
- Duplicate enqueue/Send calls cannot reset a completed job, a live lease or a quota/review hold. Explicit `resume: true` is required to release a hold. An already-open tab running the old browser loop cannot unpause holds automatically.
- Existing broadcast campaign leases protect overlap with an old in-flight browser request. An old expired campaign lease may delay recovery for up to its existing 15-minute lease period; no recipient is resent to accelerate recovery.

## Owned files

- `src/lib/backgroundEmailQueue.ts` (new), `src/lib/backgroundEmailWorker.ts` (new)
- `src/app/api/email/worker/route.ts` (new authenticated POST worker + read-only authenticated GET readiness)
- `src/lib/contractProductBroadcasts.ts`, `src/lib/cleanerEmailDelivery.ts`, `src/lib/emailDeliveryQueue.ts`, `src/lib/cleanerEmailPolicy.ts`
- `src/app/api/admin/contract-products/route.ts`, `src/app/api/admin/cleaners/email/route.ts`
- `src/components/admin/ContractProductsWorkspace.tsx`, `src/components/admin/CleanerEmailComposer.tsx`
- `src/lib/useEmailDeliveryStatus.ts` (renamed from deleted `useEmailQueueRunner.ts`; polls only)
- `supabase/migrations/20261119033522_background_cleaner_email_delivery.sql` (new forward migration)
- `tests/background-email-worker.test.mjs`, `tests/background-broadcast-delivery.test.mjs` (new)
- `tests/cleaner-email-delivery.test.mjs` (adapted to separate enqueue/worker steps, adds page-independent dispatch)
- `scripts/test-background-email-database.mjs`, `tests/integration/background-email-browser.mjs` (new)
- This handoff.

## Schema/API changes

New service-only RLS table `background_email_jobs`, primary key `(kind,target_id)`. Restricted service-only functions: `enqueue_background_email`, `claim_background_email_job`, `finish_background_email_job`, `background_email_worker_ready`, `background_email_tick`. Only the two Vault-reading functions use SECURITY DEFINER with fixed search_path and public/anon/authenticated EXECUTE revoked. Existing campaign/batch/recipient schemas and records are unchanged.

New `broadcast.status` action is read-only. Existing Send/Continue actions keep request IDs and response counters, adding `backgroundStatus`, `paused`, `deliveryMessage`. Continue now enqueues rather than calling the provider. Explicit `resume: true` releases only a paused/review job; request bodies cannot select the internal worker-only delivery path.

## Required production rollout order

1. Recheck latest main and exact READY production; reconcile only these intended files with all other ready work.
2. Generate a dedicated strong random secret in memory. Provision **production-only** Vercel `BULK_EMAIL_WORKER_SECRET`, and matching Vault secret `bulk_email_worker_secret`. Vault `bulk_email_worker_url` must be exactly `https://securecleaning.com.au/api/email/worker`. Do not print or persist secrets in source, handoff, logs or shell command arguments. Preserve existing SMS/Resend credentials.
3. Apply reviewed migration. pg_cron 1.6.4, pg_net 0.20.0 and Vault 0.3.1 were independently verified live. Migration schedules `secure-cleaning-background-email` every 15 seconds; the empty ledger makes it an idle no-op. Scheduler readiness prevents enqueue if Vault/cron is missing. New code also refuses enqueue without its Vercel worker secret.
4. Deploy integrated source through SC. Verify exact READY production source and alias.
5. Verify authenticated **GET** `/api/email/worker` returns `{ready:true}`; this cannot claim jobs or send messages. Verify missing/incorrect secret returns 401. Do not call POST to test delivery, create test campaigns, restart old campaigns or reset recipients.
6. Verify Cron entry and service-only ACL/RLS, ledger still empty, original campaign still completed/401 sent. Check cron run errors and Vercel errors read-only. Final production UI inspection, if an authenticated admin session is available, is read-only.

Rollback: disable the new cron job and let any worker lease/in-flight request expire before reverting application code. Retain migration, recipient statuses and the job ledger. Do not reset claims, delete audit records or replay completed jobs. Previous code ignores the new table; it still uses existing recipient/campaign claims. If production secrets/scheduler readiness fails, keep saved queued recipients and surface the issue rather than sending from the browser.

## Validation

- Full `npm test`: 878 tests passed on final source; includes worker authentication/read-only health, idle queue, active actor/current region, overlapping ticks, quota hold, error review, fixed request routing, actual broadcast sender logic, preserved sent/unknown/stale claims, provider acceptance with lost DB finalization, suppression and idempotency headers.
- `npm run type-check`, `npm run lint`, production `npm run build`, `git diff --check`: passed, including the final rebuild. Final suite rerun after the health/old-tab guard changes also passed all 878 tests.
- PostgreSQL/PGlite script passed: no historical enrollment, readiness gates, ownership, idempotent enrollment, lease concurrency/CAS/recovery, quota hold/resume, immutable existing recipient rows, revoked untrusted access. HTTP/Vault/scheduler are synthetic stubs, so it sends nothing.
- Actual React broadcast/cleaner screens in headless Chrome: read-only status polling; close tab while pending; reopen completed request without Send/Continue; close composer while polling. All APIs mocked and external network blocked. Formatting editor is stubbed because it is unchanged. Screenshot `/tmp/sc-background-broadcast.png`.
- No real emails/SMS, customer test writes, provider retries, campaign edits or deployments were performed by this feature task.

Synthetic script commands:
```
PGLITE_MODULE=/private/tmp/sc-inspection-sms-tools/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-background-email-database.mjs
ESBUILD_MODULE=/Users/lyle/.npm/_npx/67eb4586ca667318/node_modules/esbuild/lib/main.js PLAYWRIGHT_MODULE=/Users/lyle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node tests/integration/background-email-browser.mjs
```

Known limitation: an uncertain provider outcome stays visible for human review and is not automatically resent, even if the provider may not have accepted it. This is intentional duplicate prevention. Database commit and provider acceptance cannot be one atomic transaction.
