# Large cleaner email campaigns

Baseline: deployed 3126a1b649e92391c974a01a389e68cd75e5a588. The b3b0 worktree was reconciled to this existing commit only after verifying all 53 prior candidate files byte-for-byte; no file contents were discarded and no new commit was created. This new delta is local, not deployed. Single implementation owner: Admin Improvements.

## Changes

- Removed the 50-recipient campaign restriction from active broadcast and cleaner-email validation/UI and new database entry points. The earlier deployed SQL files are unchanged; historical/deprecated RPCs retain their old contracts.
- Removed the broadcast query's silent 500-approved-record cutoff. Deterministic 250-row pagination covers cleaner selection, suppressions and status totals beyond Supabase's usual result-page limit. Explicit address lists have a 300,000-character transport bound; route payload limits still apply. This is not a daily/monthly sending allowance.
- Each delivery HTTP request processes at most 10 queued recipients with a 12-second soft loop budget; routes allow 60 seconds. Browser continuation runs automatically while the page remains open. Session request references allow same-tab refresh/recovery. Closing the page stops further chunks; this is not a detached background worker or a cron service. Resume only queued records. Multiple requests cannot reclaim sent/unknown records.
- A service-only database pacing gate shares one slot per 600ms across these two bulk flows. Other existing transactional mail uses its existing path. Explicit provider rate rejection leaves that recipient queued; quota rejection pauses automatic continuation until the user resumes. Network/SDK ambiguity is never automatically resent.
- Campaign sender/jobs/from information and cleaner batch sender/header/content are persisted for continuation. Existing pre-migration in-progress campaigns without required sender snapshots fail closed; inspect delivery history before replacing them. Broadcast leases expire after two minutes if a request is interrupted; a new runner marks stale sending outcomes unknown, never queued.
- Existing active-role, creator, regional, subscription and per-recipient eligibility checks retained. Existing per-hour campaign-creation/API abuse limits remain; they are not recipient or daily sending limits. No account plan is purchased or changed by this feature.
- Shared rich editor setEditable now suppresses update events for lock changes, fixing previews being invalidated when the form temporarily becomes read-only.

## Migration and API contracts

Apply `supabase/cleaner_email_large_campaigns_migration.sql` after the existing rich-email, cleaner-email-delivery and contract-product-multiple-recipient migrations, before deploying this delta. Review against the target schema first. Adds delivery snapshots/headers and service-only pacing table/RPC; replaces v3 broadcast reservation without the 50 cap; adds reserve_cleaner_email_batch_v2 with server sender snapshots; shortens broadcast lease. Original cleaner reserve RPC is retained for compatibility. No migration has been run on production for this delta. Rollback to previous app leaves additive columns/functions unused; do not automatically resend pending campaigns.

Existing POST endpoints add `continue` (cleaner email, requestId) and `broadcast.continue` (product broadcasts, idempotencyKey). Both reauthenticate and authorize ownership server-side and only continue already reserved sends. Responses add inProgress/paused (broadcast also remainingCount). Cleaner previews return recipient metadata for the whole list but HTML for one selected recipient, requested via previewCleanerId, to keep responses manageable. Both UI callers updated. No dependencies changed.

## Provider and backend read-only verification

User explicitly confirmed existing Resend/Supabase API access. Configured credentials were used server-side without printing them. Supabase HEAD returned 200 and 530 approved cleaners. Resend GET /usage returned 404/not_found and a ratelimit-limit header of 10. Its usage endpoint is a private beta, so the plan upgrade and actual remaining monthly quota were not verified. No email was sent to obtain quota headers.

Official sources checked: https://resend.com/docs/api-reference/rate-limit and https://resend.com/docs/api-reference/usage/retrieve-usage. Paid plans have no daily quota but provider rate/monthly limits remain authoritative. Application pacing is conservative and quota failures pause the queue.

## Validation and remaining release checks

PASS: npm run type-check; npm run lint; npm test (267 tests); npm run build with synthetic Supabase credentials; git diff --check. Disposable PGlite test applies migrations twice and exercises 501 cleaner emails and 501 broadcast recipients, replay protection, pacing, competing campaign leases, rejection at claim, one-time recipient claims and anonymous denial. Mocked delivery tests cover 61 messages through bounded continuation, provider quota pause, unknown network outcome and provider-accepted/finalization-failed replay. Pagination test verifies all 1,201 rows.

Manual browser: temporary localhost harness with every API call mocked. Actual cleaner composer previewed 61 addresses, confirmed and progressed from 20 sent/41 queued to 61 sent/0 queued; actual broadcasts UI enabled Send for 501 recipients. Preview invalidation bug reproduced and fixed. Harness removed, server stopped and temporary tab closed. No production sends/deletions/data writes; no real inbox test. Live migration review, deployment and production authenticated checks remain release steps. Earlier inherited dependency findings remain outside this change.

Large-campaign throughput is deliberately paced; it is not a promise to send 50,000 messages in one HTTP request. No full 50,000-recipient load test performed. The browser must remain open or the same saved request must be resumed. This limitation is stated in both composers.

## Exact delta manifest

- `docs/large-email-campaigns-handover.md`
- `src/app/api/admin/cleaners/email/route.ts`
- `src/app/api/admin/contract-products/route.ts`
- `src/components/admin/CleanerEmailComposer.tsx`
- `src/components/admin/ContractProductsWorkspace.tsx`
- `src/components/admin/RichEmailEditor.tsx`
- `src/lib/cleanerEmailDelivery.ts`
- `src/lib/cleanerEmailPolicy.ts`
- `src/lib/contractProductBroadcasts.ts`
- `src/lib/emailDeliveryQueue.ts`
- `src/lib/useEmailQueueRunner.ts`
- `supabase/cleaner_email_large_campaigns_migration.sql`
- `tests/cleaner-email-delivery.test.mjs`
- `tests/contract-products.test.mjs`
- `tests/email-queue.test.mjs`
- `tests/integration/cleaner-email-postgres.mjs`
- `tests/rich-email-composer.test.mjs`
