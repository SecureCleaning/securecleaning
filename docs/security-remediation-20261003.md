# Security remediation candidate - 3 October 2026

## Baseline and ownership

This security release is based exactly on scanned release `3b4cee970e293c89c486edb45452457d2016811b`. It lives in the isolated `security-remediation` worktree. The implementation lead is the sole writer for all changed files, including shared modules, migration SQL, and integration changes. Original checkouts and their unfinished work were preserved. No commit, push, production query, migration execution, credential change, email/SMS delivery, or deployment was performed.

This is a locally validated implementation candidate, not confirmation that production findings are resolved. Source handoff: `/Users/lyle/Documents/Codex/2026-10-03/task/secure-cleaning-security-handoff.md`.

## Release authorization

The user subsequently authorized commit, migration and deployment. Production schema prerequisites were verified and the independent production signing secret was provisioned. A local export of sensitive staff/settings backup data was rejected by automatic approval review and was not performed. Provider recovery checks and final rollout results are recorded separately.

## Findings addressed

| Finding | Implementation |
| --- | --- |
| `csf_de800ff8c5b3138c6165efc0` | Availability configuration moves transactionally into service-role-only storage. Public content uses a literal marketing-key allowlist in RLS and an application allowlist. Agent signing requires an independent server secret, v2 purpose-bound tokens, exact token shape and bounded expiry. Existing code hashes serve as revocation input, not signing secrets. Hashes and private calendar identifiers/subscriptions are removed from browser DTOs. |
| `csf_d9e1f7b3c84ff9d2c005be2e` | Every staff authorization resolves the current active account. A database-maintained session revision changes on username, password, legacy password, role, active status or regional assignment changes. Sessions bind that revision and current security state. All callers await the resolver; lookup failure denies access. |
| `csf_cdeb3314ab2b67f6312d5000` | Quote JSON, quote pages and scope helpers require a 256-bit random capability or current authorized staff access. Only token hashes are stored. Document capabilities bind quote, purpose, variant, expiry, revocation and document version/content. Final public output also requires a send timestamp at or after the current review. Staff regional preview access remains enforced. |
| `csf_16335adff0a36b3b7cdca8c7` | Linked booking POST verifies a booking-purpose capability and authoritative quote contact/client relationship before customer, site or provider effects. An RPC rechecks the capability/contact under locks and atomically inserts site/booking, accepts the quote and consumes the token. Replays return the existing booking and skip CRM/email/calendar work. Deleting a consumed booking does not reactivate the capability. Invalid phone normalization cannot relax identity matching. |
| `csf_644df2d2e1ec95f359558c29` | All limiter callers use a shared atomic database RPC. User-Agent and arbitrary proxy headers cannot change identity. Only Vercel's overwritten ingress header is trusted when `VERCEL=1`; other hosts use a conservative shared bucket. TTL cleanup, bounded cardinality and a global budget limit abuse. Store failure returns 503 before downstream work. |
| `csf_5fb0da9b7bfd0ead944761c5` | Generic jobs submissions remain unverified leads and cannot match a cleaner by guessed email. Verified portal claims supply cleaner identity, with current approval/state/email checked again. Duplicate submissions cannot overwrite verified attribution or repeat notifications. A verified submission can upgrade an existing unmatched lead. |
| `csf_cf0204a263ab7f1a84097a81` | Untrusted quote, booking, cleaner-registration and fallback notification text is HTML-encoded at rendering boundaries. Existing staff rich HTML retains its separate sanitization path. Synthetic payloads are checked through a fake email transport. |
| `csf_47337b4c20893dfe69bc8e53` | Cleaner and commission CSV output share a formula-neutralizing cell encoder, including whitespace/control prefixes, quote escaping and array values. |

## Migration and prerequisites

Apply `supabase/migrations/20261003082816_security_remediation.sql` before starting the new application, under a controlled write pause. It is a forward, repeatable, transactional migration. Do not run it against production without the separately approved rollout.

Required existing baseline objects: `site_content`, `admin_staff_accounts` including `legacy_password_hash` and `availability_assignee_id`, `quotes`, `bookings`, `sites`, the existing city/premises enums, and inspection/site booking columns. The final-quote workflow columns, including review/send timestamps, must exist.

Changes:

- Add `admin_staff_accounts.session_version` and a security-change trigger.
- Create `availability_private_config`, copy the existing availability row without embedding values, then remove its old source row. On reapplication, the private copy is retained.
- Remove policies on `site_content` applying to public/anon/authenticated and replace public SELECT with an exact marketing-key allowlist. Unlisted operational rows remain server-only.
- Create service-only `quote_capabilities`, `booking_security_outbox` and `public_rate_buckets`.
- Create service-only, security-invoker `create_authorized_quote_booking` and `consume_public_rate_limit` RPCs with fixed search paths and explicit grants.

The old application must not resume writes after the migration: it would still use the old configuration storage. Deployment and SQL need a coordinated maintenance window, although the containment policy prevents old writes from becoming publicly readable.

New required environment name: `AVAILABILITY_AGENT_SIGNING_SECRET`, independent random material of at least 32 characters, server-only. Existing `ADMIN_SESSION_SECRET` remains required. Quote capabilities no longer use the Supabase service key or `QUOTE_BOOKING_HANDOFF_SECRET` as signing material. No new database service, package dependency, package version or lockfile change is required.

## API and user-visible changes

- Staff and agent legacy tokens are rejected at cutover. Staff must sign in again. Agent calendar subscription links must be replaced; new feed tokens expire after 365 days. Code reset or signing-secret rotation revokes agent signatures.
- Old quote links containing only a reference or the legacy v1 handoff no longer authorize customer access. Reissue links through existing authorized quote/scope email actions or the editor's Copy link control; no bulk reissue was performed.
- Quote creation adds `bookingHandoffToken` and `documentAccessToken` to its response. Browser storage and quote/result links carry these separate purposes. Scope-only links do not offer booking/edit actions without booking authority.
- Public quote/scope URLs accept `access`; booking and private prefill use `handoff`. Booking POST sends `handoff` in its body. The token is stripped before persistence, email and calendar work. Contact changes or missing/invalid saved phone details require staff reconciliation, not email-only matching.
- `POST /api/quote/[ref]/access` issues document links only for current authorized staff and region-authorized agents. Viewer accounts cannot issue them. Final links require publication of the current review.
- Editing remote document content or revising a final document invalidates earlier document capabilities. Send a new customer link after the change.
- Availability DTOs omit hashes/private calendar fields. Admins can enter replacement private calendar values; blank inputs retain the saved values. Public availability no longer returns private calendar IDs.
- Generic jobs interest is an unverified enquiry; approved attribution requires an existing verified cleaner-portal identity. The page explains this behavior.
- The global limiter ceiling is 1,000 limiter calls per minute, with 100,000 active buckets maximum. Multiple route policies consume multiple calls. Retain existing per-route and per-recipient limits; review shared-IP capacity in staging.
- Protected document output is private/no-store; the application uses no-referrer headers.

## Validation

- `npm run type-check`: passed.
- `npm run lint`: passed, no warnings.
- `npm test`: 435 tests passed, none failed or skipped on the final run.
- `npm run build`: passed using synthetic Supabase configuration. No production credentials were loaded.
- `git diff --check`: passed.
- `tests/integration/security-remediation-postgres.mjs`: passed against isolated PGlite with synthetic records. Covered migration reapplication, anon/authenticated denial, marketing allowlist, private backfill, service-role access, staff revocation, queued concurrent limiter/booking calls, expiry, denied booking contacts, atomic rollback, replay and revocation. PGlite is an external test runtime, not an application dependency. Multi-connection staging load tests remain a rollout check.
- New behavioral tests cover staff revocation/lookup failure, old-hash token forgery and purpose separation, capability hashing/expiry/revocation/version/publication, zero downstream effects on invalid linked bookings, generic versus verified cleaner identity, CSV encoding, and document-helper denial before protected reads.
- Captured quote/scope/booking emails use a fake transport with injected HTML. No real message was sent.
- Manual local browser checks: reference-only quote and scope pages display generic 404 pages with no customer detail. HTTP inspection confirmed 404, `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. Screenshot: `/private/tmp/sc-security-scope-denied.png`. Browser and local server were closed afterward.

Repeat isolated SQL test with an existing PGlite runtime:

```sh
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/integration/security-remediation-postgres.mjs supabase/migrations/20261003082816_security_remediation.sql
```

## Separately approved rollout and remaining checks

1. Select and commit the reviewed candidate; compare any newer remote main changes before integration. The user authorized commit, migration and deployment on 3 October 2026. Remote main and production were confirmed at the scanned baseline before release preparation.
2. Inspect effective production grants, policies, views, RPCs and prerequisite columns; obtain a protected backup and count affected staff, agents, feeds and legacy quote links without exposing values. No such production inspection was performed here.
3. Confirm the Vercel ingress contract and production limiter capacity; provision the independent signing secret through the normal secret store. Exclude capability query parameters (`access`, `handoff`, `token`) from infrastructure logs and third-party analytics/widget URL collection. These external settings were not inspected or changed.
4. Pause affected writes, apply the reviewed migration, deploy the compatible application and verify actual role permissions. Maintain the private boundary throughout recovery.
5. Reset exposed agent access codes, replace feeds, sign staff in again, and selectively reissue customer links through authorized workflows. Do not restore a reference-only bypass.
6. Check legitimate admin/agent login, regional views, quote creation/email/edit/scope/print/final sends, valid linked and unlinked bookings, verified cleaner interest, limiter outage handling and calendar subscriptions in staging/production with explicit permission. Browser checks here covered denial paths; no end-to-end real-provider or authenticated production workflow was exercised. Synthetic CSV round-trips passed; visual Excel/LibreOffice interpretation remains unverified.
7. Reconcile `booking_security_outbox` pending/review-required entries before any operator retry. This candidate deliberately avoids automatic resend after an ambiguous provider result. One booking request invokes each external workflow once; a crash or partial delivery can need manual CRM/email/calendar repair through existing operator workflows. Unlinked booking deduplication is unchanged.
8. Rerun Security Cloud against the eventual exact release commit and attach runtime/ACL evidence before marking findings closed.

The locked dependency install reported 29 existing audit advisories (1 low, 7 moderate, 20 high, 1 critical). Dependency upgrades were outside these eight findings and were not applied. The build also reports the existing SWC-minifier and Browserslist notices. Separately review these, the scan's deferred effective grants/RPC coverage beyond `site_content`, upload body-size enforcement, and lower-risk files outside the scan coverage.

Rollback must not restore public operational data, old hash-derived tokens, stale staff authority, or reference-only quote access. Keep private storage/revocations and use a compatible secure application revision or temporarily disable affected workflows while recovering forward.

## Changed-file manifest

The list below includes asynchronous authorization/limiter caller migrations as well as the feature owners. No files in another checkout were edited.

- `.env.example`
- `docs/security-remediation-20261003.md`
- `next.config.js`
- `scripts/check-env.mjs`
- `src/app/admin/availability/page.tsx`
- `src/app/admin/availability/quoters/[assigneeId]/page.tsx`
- `src/app/admin/calendar/page.tsx`
- `src/app/api/address-autocomplete/route.ts`
- `src/app/api/admin/alerts/route.ts`
- `src/app/api/admin/audit/route.ts`
- `src/app/api/admin/availability/route.ts`
- `src/app/api/admin/bookings/[ref]/route.ts`
- `src/app/api/admin/cleaner-access/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/comments/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/documents/[documentId]/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/documents/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/email/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/route.ts`
- `src/app/api/admin/cleaners/email/route.ts`
- `src/app/api/admin/cleaners/export/route.ts`
- `src/app/api/admin/cleaners/import/route.ts`
- `src/app/api/admin/cleaners/route.ts`
- `src/app/api/admin/client-crm/[opportunityId]/deletion/route.ts`
- `src/app/api/admin/client-crm/route.ts`
- `src/app/api/admin/commissions/route.ts`
- `src/app/api/admin/consumables/image/route.ts`
- `src/app/api/admin/consumables/import/route.ts`
- `src/app/api/admin/consumables/route.ts`
- `src/app/api/admin/content/route.ts`
- `src/app/api/admin/contract-products/route.ts`
- `src/app/api/admin/contract-sales/checklists/route.ts`
- `src/app/api/admin/contract-sales/route.ts`
- `src/app/api/admin/locality-autocomplete/route.ts`
- `src/app/api/admin/ops/route.ts`
- `src/app/api/admin/pricing/route.ts`
- `src/app/api/admin/quotes/[ref]/deletion/route.ts`
- `src/app/api/admin/quotes/[ref]/send/reconcile/route.ts`
- `src/app/api/admin/quotes/[ref]/send/route.ts`
- `src/app/api/admin/quotes/[ref]/workflow/route.ts`
- `src/app/api/admin/reporting/route.ts`
- `src/app/api/admin/room-types/route.ts`
- `src/app/api/admin/session/route.ts`
- `src/app/api/admin/sites/route.ts`
- `src/app/api/admin/staff/migrate/route.ts`
- `src/app/api/admin/staff/route.ts`
- `src/app/api/availability-agent/[assigneeId]/bookings/[bookingRef]/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaner-access/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/comments/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/documents/[documentId]/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/documents/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/email/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/route.ts`
- `src/app/api/availability-agent/[assigneeId]/feed/route.ts`
- `src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts`
- `src/app/api/availability-agent/[assigneeId]/quotes/[ref]/workflow/route.ts`
- `src/app/api/availability-agent/[assigneeId]/route.ts`
- `src/app/api/availability-agent/[assigneeId]/sale-alerts/route.ts`
- `src/app/api/availability-agent/session/route.ts`
- `src/app/api/availability/route.ts`
- `src/app/api/booking/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/cleaner-email-preferences/unsubscribe/route.ts`
- `src/app/api/cleaner-portal/documents/route.ts`
- `src/app/api/cleaner-portal/profile/route.ts`
- `src/app/api/cleaner-portal/request-access/route.ts`
- `src/app/api/email-preferences/unsubscribe/route.ts`
- `src/app/api/jobs/interest/route.ts`
- `src/app/api/locality-autocomplete/route.ts`
- `src/app/api/menu-settings/route.ts`
- `src/app/api/quote/[ref]/access/route.ts`
- `src/app/api/quote/[ref]/booking-prefill/route.ts`
- `src/app/api/quote/[ref]/route.ts`
- `src/app/api/quote/route.ts`
- `src/app/api/staff/sms/route.ts`
- `src/app/availability/quoters/[assigneeId]/page.tsx`
- `src/app/jobs/access/[token]/route.ts`
- `src/app/quote/[ref]/page.tsx`
- `src/app/quote/result/page.tsx`
- `src/app/scope/[ref]/page.tsx`
- `src/components/admin/AvailabilityAdmin.tsx`
- `src/components/admin/CommissionsWorkspace.tsx`
- `src/components/admin/QuoteWorkflowEditor.tsx`
- `src/components/booking/BookingForm.tsx`
- `src/components/products/ContractProductInterestForm.tsx`
- `src/components/quote/QuoteForm.tsx`
- `src/components/quote/QuoteResult.tsx`
- `src/components/quote/QuoteResultView.tsx`
- `src/lib/abuseProtection.ts`
- `src/lib/adminAuth.ts`
- `src/lib/adminNotifications.ts`
- `src/lib/availability.ts`
- `src/lib/availabilityAgentAuth.ts`
- `src/lib/cleanerAdminAuth.ts`
- `src/lib/cleanerPortal.ts`
- `src/lib/cleaners.ts`
- `src/lib/clientCrmAuth.ts`
- `src/lib/clientCrmData.ts`
- `src/lib/content.ts`
- `src/lib/contractProductInterest.ts`
- `src/lib/csvCell.ts`
- `src/lib/email.ts`
- `src/lib/htmlEscape.ts`
- `src/lib/quoteBookingAccess.ts`
- `src/lib/quoteSession.ts`
- `src/lib/quoteStaffAccess.ts`
- `src/lib/quoteWorkflowData.ts`
- `src/lib/staffAccounts.ts`
- `supabase/migrations/20261003082816_security_remediation.sql`
- `tests/cleaner-admin-security.test.mjs`
- `tests/cleaner-deletion.test.mjs`
- `tests/cleaner-email-delivery.test.mjs`
- `tests/cleaner-unsubscribe.test.mjs`
- `tests/client-crm-foundation.test.mjs`
- `tests/client-crm-intake.test.mjs`
- `tests/final-quote-workflow.test.mjs`
- `tests/integration/security-remediation-postgres.mjs`
- `tests/invoice-payment-preview.test.mjs`
- `tests/quote-booking-handoff.test.mjs`
- `tests/quote-customer-journey.test.mjs`
- `tests/quote-deletion-override.test.mjs`
- `tests/quote-email-cc.test.mjs`
- `tests/security-auth-fixture.mjs`
- `tests/security-regression.test.mjs`
- `tests/security-remediation.test.mjs`

## Workflow audit follow-up - 2026-10-04

The live NSW availability calendar recovered from React hydration errors 418/423.
Its fortnight view grouped events using host-local dates, while displaying times
in the agent's regional timezone. This code predates the security release.

The correction uses regional YYYY-MM-DD keys and UTC calendar-label arithmetic
for fortnight navigation, including daylight-saving boundaries. The full calendar
has an identical initial loading state before reading the browser clock. The
server-supplied seven-day dashboard retains its immediate rendered content.

Changed files: AgentCalendarPanel.tsx, availabilityCalendarClient.ts,
agent-calendar-timezone.test.mjs, and this report. No migrations, API/data contract
changes, environment changes, or dependency changes are required.

Validation: type-check, lint, all 438 tests, production build, and diff whitespace
check passed. Regression tests cover differing host timezones, midnight, both DST
transitions, year boundaries, navigation, and stable initial render. Build retains
existing SWC-minifier and Browserslist age warnings.

Manual live checks so far: owner cleaner directory and nominated sample record;
NSW agent dashboard, regional quotes, quote workbench, final scope preview,
availability, client CRM, and existing test opportunity-to-product/cleaner scope.
Isolated PostgreSQL checks pass for access restrictions, migration replay, staff
revocation, rate-limit concurrency/expiry, and atomic booking creation/replay.
These checks do not establish live email delivery, cleaner self-service login,
new booking/calendar writes, or full customer-to-cleaner handoff. Those remain
pending the requested test email/appointment authorization. No live business
records were changed during these checks.

### Regional cleaner email correction - 2026-10-04

Live testing with the authorised NSW Cleaning Sample Company exposed a separate
regional email preview failure: the availability assignee identifier was passed
to a staff UUID lookup (PostgreSQL 22P02). Sender resolution now reads the active
regional assignee's work email, validates the state and email, and retains the
existing staff-account path for owner/admin sends. Preview and send use the same
resolution, so sender changes invalidate the preview fingerprint.

Changed files: src/lib/cleaners.ts, tests/cleaner-regional-email.test.mjs, and this
report. No migrations, API/data contracts, dependencies or environment changes.
Validation: type-check, lint, 441 passing tests, production build and diff check.
Read-only verification against the live nominated cleaner confirmed the fixed
preview resolves the recipient and NSW sender correctly. Production browser
send and delivery checks follow deployment.

The nominated cleaner's access-link email was delivered and its portal worked.
A temporary preferred-work change persisted after reload; the field was restored.
The labelled public quote SC-20261004-0Z8O was created through the UI, and both
customer and admin notification emails were delivered. Browser upload testing
was blocked by the extension's file-URL permission; that setting was not changed.

### Provider reply-to correction - 2026-10-04

The regional cleaner test email was delivered and logged after the sender fix.
Provider verification then showed reply_to was null. The installed Resend 3.x
SDK forwards payloads unchanged and expects reply_to; existing callers supplied
replyTo. Both shared send helpers now normalize that field at the provider
boundary, preserving any explicit reply_to and leaving recipients, copies,
attachments and other headers unchanged. No dependency upgrade is needed.

Changed files: src/lib/email.ts, tests/email-provider-routing.test.mjs, this report.
No migration, public API/data-contract, dependency or environment changes.
Validation: type-check, lint, all 444 tests, production build and diff check passed.
Tests exercise both helpers through the installed SDK and verify the actual JSON
request, non-mutation, explicit-field precedence, attachments, and rejection type.

Further live evidence: remote quote and scope links returned 200 without staff
cookies; the sample cleaner upload API saved the harmless other-type PNG, it
appeared in the regional UI, and its downloaded bytes matched. Browser file-picker
verification remains blocked by the extension setting. Cleaner profile comparison
confirmed only updated_at changed after restoration. Booking submission is staged
for 20 October 2026, 11:00 Sydney time, pending action-time Terms confirmation.

### Booking attachment correction - 2026-10-04

The authorised test booking BK-20261004-DVUL passed creation, customer/admin
email delivery and regional calendar/feed checks for 20 October at 11:00 Sydney
time. Cancellation through the regional UI changed both stored statuses to
cancelled and removed the feed event. Final quote SC-20261004-0Z8O was reviewed,
published and sent; provider delivery and both customer document links passed.
Internal inspection notes were absent from customer output.

Inspection of the actual delivered booking attachment found corrupted bytes:
plain ICS text was sent where Resend expects Base64, and contentType did not
match the installed SDK's content_type field. The booking sender now encodes
UTF-8 as Base64 and supplies the correct MIME field. Other attachment callers
already encode Base64. The regression test calls the real booking sender through
the installed SDK, decodes the outbound payload, and checks calendar framing,
reference, exact UTC start/end and MIME type.

Changed files: src/lib/email.ts, tests/email-provider-routing.test.mjs,
tests/quote-email-cc.test.mjs (Node Buffer in its VM harness), this report.
No migration, public API/data-contract, dependency or environment changes.
All 445 tests pass. Live corrected sender verification delivered an attachment
with MIME text/calendar, valid VCALENDAR framing, correct reference and UTC
times 20261020T000000Z to 20261020T001000Z. This verification used the actual
source sender and installed SDK, without creating or reactivating a booking.
Browser file-picker and external calendar-client import remain unverified.

Validation for the attachment correction: type-check, lint, 445 tests, production
build and git diff --check passed. Existing build warnings are unchanged.
