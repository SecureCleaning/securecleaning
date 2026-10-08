# Secure Cleaning medium/low remediation - 8 October 2026

## Scope and source

Implementation based on GitHub main f6ce40a9e737b0554fa5ddbdfb14b464b6b4a769 in the existing clean security-remediation worktree. The older main checkout and its unrelated uncommitted work were preserved. No new worktree was created.

Scan: wfr_ca744b8e6143473b6e2ed4cab521fb73cc38f6f338942360e8e95c6df322f339, completed 6 October 2026 22:02:42 UTC, revision fb2b1a55a717484c7a6f83b82501adcaa1c85748. All 18 full finding records were retrieved using repository-scan occurrence IDs; the short csf IDs are not accepted by findings_get. No new scan launched and no findings closed.

Live catalog-only checks confirmed historical grants and policy definitions. No customer/private table rows were inspected. Existing installed migrations have different timestamps from local filenames; never replay them based on filename mismatch.

## Finding disposition

| Finding | Change / disposition |
| --- | --- |
| csf_45ba1bb0385ee0e1bd85c52c | Revoke all browser/PUBLIC table and column privileges on legacy ai_chat_sessions; drop unconditional read and insert policies. Server privileges retained. |
| csf_edc8d26f41e4733bedfe357f | Revoke browser/PUBLIC table and column privileges on owner_operators and owner_operator_ratings; drop public SELECT policies. No public directory consumer exists in src. No new public projection or fields are exposed. Approval must confirm this choice. |
| csf_f02e1beb37eda41db3e53013 | Revoke quote INSERT including column grants and remove anonymous insertion policy. Authenticated quote read policy remains. Public quote/chat routes continue server validation. |
| csf_3eab793db8646b418ff0e2f8 | Remove raw availability code header fallback; retain signed sessions and linked staff. Existing credential endpoints retain rate limits. |
| csf_7e63aef167e8dceb5c91d9cc | Atomic subject eligibility before charging shared accepted-work budget; bounded expiry cleanup and total bucket cap. |
| csf_18dac42311c5a4dc97b4ad12 | Agent DELETE clears inspection schedule, retains parent booking status and assignment, records inspection-specific audit event. |
| csf_77a227faabdf382f18edd90e | Durable individual-send request and unresolved-draft reservations, provider idempotency key, unknown outcome handling, explicit-rejection-only retry. UI request UUID survives lost response/reload; intentional identical future send possible after confirmed success. |
| csf_0e2e12f59d4923e4c1b39c68 | Actual streamed bytes bounded before JSON/multipart parsing; Content-Length only early rejection. Existing route guards migrated to await. |
| csf_282b643b689caf35eae255d1 | Bounded workflow input validation and legacy read checks; DB trigger caps changed inspection/workflow/final JSON documents while allowing unrelated updates to legacy oversized rows. |
| csf_e37b499dfa33c57a34bf3f8b | Narrow document signature/structure checks and canonical file type/name; active PDF marker rejection; private downloads use attachment, octet-stream, nosniff, no-store and sandbox CSP. This is not an antivirus guarantee. |
| csf_8e79b952b4bb6c9833612668 | Consumables export reuses formula-safe csvCell for every cell. |
| csf_2c5ce449c83d1271fb562d99 | Replace application-origin vendor script with fixed external-origin iframe; explicit public-route allowlist, no-referrer, no parent message handler, route-change teardown. Existing provider retained. |
| csf_459dcfd432757adac85e6f3c | Strict chat role/string/unknown-key validation and aggregate budget. |
| csf_120525d0c47c7349c6f2da8f | Finite bounded quote inputs and calculation-result checks. |
| csf_f6df92abb36d42b35016739e | Shared RFC5545 TEXT escaping normalizes CR/LF/CRLF; UTF-8 line folding across booking/agent/contract artifacts. |
| csf_d818348f1569729a67cf6277 | XLSX central/local ZIP checks, expansion/member/dimension caps, bounded worker parsing; ExcelJS explicitly packaged for Node worker. |
| csf_4c686d361c6a85694a6e5eca | Intended policy retained: authorized reopening needs no manager approval; assignment regression tests. |
| csf_893cd3b27e9fdf1743130a72 | Intended policy retained: cleaner state transition needs no reapproval; ownership/email/internal-field regression tests. |

## Exact live approval bundle (not applied)

Target Supabase project qhqbthnpzsnnzfannvyl and SecureCleaning/securecleaning production application securecleaning.com.au.

Apply ONLY new forward migration 20261008053208_security_medium_low_remediation.sql after catalog preflight and metadata backup:

- PUBLIC, anon, authenticated: REVOKE ALL table and per-column privileges on public.ai_chat_sessions, public.owner_operators, public.owner_operator_ratings.
- PUBLIC, anon, authenticated: REVOKE INSERT table and per-column privileges on public.quotes. Preserve authenticated SELECT, its ownership policy, and all service_role privileges.
- DROP policies: ai_chat_sessions."Users access own chat by token", ai_chat_sessions."Anon can create chat session", quotes."Anon can insert quotes", owner_operators."Public can view active operators", owner_operator_ratings."Public read public ratings".
- Add nullable cleaner_emails.individual_delivery_key and individual_draft_fingerprint; unique index on non-null request key; unique index on non-null draft fingerprint only for sending/unknown delivery outcomes. Existing rows remain null, no history rewritten.
- Replace consume_public_rate_limit(text,text,integer,integer) implementation; retain service_role-only EXECUTE, SECURITY INVOKER, fixed search_path. Subject-denied requests no longer consume global budget. Limits remain unchanged.
- Add service-only SECURITY INVOKER enforce_quote_document_bounds() trigger on quote INSERT or update of inspection_report, firm_quote_workflow, final_quote_document. New/changed JSON text capped at 128KiB, 512KiB, 1MiB respectively. Existing values untouched.
- Publish the fully validated application in one coordinated release, including rejection of raw access-code headers and the isolated public-only Robofy widget. No real email/SMS/payment or paid scan is part of verification.

Consequences: direct browser access to legacy operator/rating/chat tables ends; no public directory is added. Any unknown external direct Data API client must migrate to an authorized server route. Repository callers use the server. Individual email delivery requires the new columns/indexes before app publication. Oversized or malformed documents rejected; ambiguous email attempts require provider-history reconciliation, never a blind resend. Public automatic Robofy popup and parent-page context are removed; user opens the isolated chat.

## Rollout and backout

1. Recheck origin/main and worktree drift; integrate any new main commits and rerun affected/full checks. Review this exact migration and public-directory decision; obtain explicit live permission/auth approval and production release authorization.
2. Save catalog ACL/policy/function definitions and deployment identifiers. Inspect actual installed migration SQL/state. Do not reapply older migrations with differing local timestamps.
3. Apply the single new migration transaction. Verify role table AND column privileges, policies, RPC EXECUTE, unique indexes, trigger/function definitions. Do not test by exposing/reading private rows or sending live messages.
4. Publish matching coherent code to main and production; verify Git SHA/tree and serving domain/deployment. Check signed-out denial, public pages, iframe isolation and supported auth paths. Use mocks/synthetic local fixtures for side-effecting flows unless separately authorized.
5. Backout: stop release on any failed prerequisite. Database additions are backwards compatible except intended privilege tightening. Retain tightened grants on application rollback; do not restore public leakage as routine rollback. Old individual-email code is unsafe after ambiguous attempts, so disable that operation or forward-fix instead of reverting its safety. Keep reservation history. Remove a size trigger only after reviewed emergency approval if a proven compatibility problem requires it. No automatic data deletion or replay.

## Verification limits and ingress

- Real isolated PostgreSQL concurrency passed with 16 independent connections and 1,596 scheduled requests, including subject/shared admission, blocked-subject isolation, global capacity races, expiry and rollback. PGlite separately covers migration replay and historical grant combinations. Production load testing remains unperformed.
- File structure checks do not replace malware scanning. Protected download headers reduce browser execution exposure.
- XLSX worker heap is bounded, but native buffer memory is not fully covered by V8 heap limits; preflight inflated-byte limits bound inputs separately.
- Vercel Functions currently cap request/response payload at 4.5MB (https://vercel.com/docs/functions/limitations). Existing application upload maximum10MiB does not override that lower platform cap. No ingress plan/settings changed. Self-hosted Next.js uses actual-byte guards; a reverse proxy should retain a hard body ceiling as defense in depth. Live oversized ingress probes were not performed.
- No real email/SMS, chat message, payment, bulk action or customer upload was sent. Manual workbook/spreadsheet/calendar-client import remains unverified unless recorded below.
- No dependencies changed. Optional individual email requestId and delivery_outcome history are backwards-compatible additions; raw-header-only authentication intentionally ends.

## Validation results

- Full regression suite: 539 tests passed, zero failures.
- TypeScript, lint, production build and git diff --check passed; packaged-route verification also passed.
- Isolated migration integration: 92 assertions passed, including historical PUBLIC/table/column grants, service submissions, authenticated own-quote reads, email indexes, limiter boundaries and document triggers.
- Real PostgreSQL concurrency: 16 connections, 1,596 scheduled requests passed. Temporary cluster stopped and removed; no production credentials used.
- Manual local browser: public homepage chat opened and rendered the existing provider greeting/suggestions/input in the external iframe. Verified zero vendor scripts in parent, no-referrer and sandbox attributes. Direct navigation to quote page showed no chat iframe. Quote wizard with synthetic details reached scheduling; no submission. Client-side route teardown and complete final-step submission were not manually verified.
- Compiled consumables POST tested using only 1,032 deployment-traced files: valid XLSX/worker returned 200, malformed workbook 400, unauthenticated request 403. All external requests mocked; no network calls. This caught and resolved both webpack worker resolution and transitive dependency tracing issues.
- No production migration, deployment or main push performed. Production readiness still requires the exact live approval and post-release verification above.

## Files and integration points

Shared files were coordinated with one writer per feature. The application changes span body-guard callers, quote/chat validation, regional auth/cancellation, cleaner email and documents, calendar exports, consumables import/export, and the isolated widget. One forward migration; no package.json/package-lock.json or dependency changes. New integration tests use an optional temporary PostgreSQL installation outside the repository.

Changed file manifest (relative to repository root):


- `docs/security-medium-low-remediation-20261008.md`
- `next.config.js`
- `src/app/api/admin/cleaner-access/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/documents/[documentId]/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/documents/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/email/route.ts`
- `src/app/api/admin/cleaners/import/route.ts`
- `src/app/api/admin/cleaners/templates/route.ts`
- `src/app/api/admin/client-crm/[opportunityId]/deletion/route.ts`
- `src/app/api/admin/client-crm/route.ts`
- `src/app/api/admin/commissions/route.ts`
- `src/app/api/admin/consumables/image/route.ts`
- `src/app/api/admin/consumables/import/route.ts`
- `src/app/api/admin/consumables/route.ts`
- `src/app/api/admin/contract-products/route.ts`
- `src/app/api/admin/contract-sales/agreements/route.ts`
- `src/app/api/admin/contract-sales/checklists/route.ts`
- `src/app/api/admin/contract-sales/route.ts`
- `src/app/api/admin/pricing/route.ts`
- `src/app/api/admin/quotes/[ref]/deletion/route.ts`
- `src/app/api/admin/quotes/[ref]/workflow/route.ts`
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
- `src/app/api/availability-agent/[assigneeId]/quotes/[ref]/workflow/route.ts`
- `src/app/api/availability-agent/[assigneeId]/route.ts`
- `src/app/api/availability-agent/[assigneeId]/sale-alerts/route.ts`
- `src/app/api/availability-agent/session/route.ts`
- `src/app/api/booking/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/cleaner-email-preferences/unsubscribe/route.ts`
- `src/app/api/cleaner-portal/documents/route.ts`
- `src/app/api/cleaner-portal/profile/route.ts`
- `src/app/api/cleaner-portal/request-access/route.ts`
- `src/app/api/email-preferences/unsubscribe/route.ts`
- `src/app/api/jobs/interest/route.ts`
- `src/app/api/menu-settings/route.ts`
- `src/app/api/quote/[ref]/access/route.ts`
- `src/app/api/quote/route.ts`
- `src/app/api/staff/sms/route.ts`
- `src/components/admin/CleanersAdmin.tsx`
- `src/components/admin/ConsumablesAdmin.tsx`
- `src/components/availability/AgentCleaners.tsx`
- `src/components/chat/RobofyWidget.tsx`
- `src/lib/abuseProtection.ts`
- `src/lib/availabilityAgentAuth.ts`
- `src/lib/boundedBody.ts`
- `src/lib/calendarInvite.ts`
- `src/lib/cleanerAgentPolicy.ts`
- `src/lib/cleaners.ts`
- `src/lib/consumablesImport.ts`
- `src/lib/contractSales.ts`
- `src/lib/documentContent.ts`
- `src/lib/email.ts`
- `src/lib/ics.ts`
- `src/lib/individualEmailRequest.ts`
- `src/lib/publicChatPolicy.ts`
- `src/lib/quoteWorkflowData.ts`
- `src/lib/securityInput.ts`
- `src/lib/xlsxSafety.ts`
- `supabase/migrations/20261008053208_security_medium_low_remediation.sql`
- `tests/accepted-remote-correction.test.mjs`
- `tests/availability-agent-cleaners.test.mjs`
- `tests/cleaner-regional-email.test.mjs`
- `tests/cleaner-upload-limits.test.mjs`
- `tests/email-provider-routing.test.mjs`
- `tests/export-upload-hardening.test.mjs`
- `tests/input-hardening.test.mjs`
- `tests/integration/consumables-packaged-smoke.mjs`
- `tests/integration/security-medium-low-postgres.mjs`
- `tests/integration/security-rate-concurrency-postgres.mjs`
- `tests/public-chat-policy.test.mjs`
- `tests/quote-email-cc.test.mjs`
- `tests/security-agent-policy.test.mjs`
- `tests/security-regression.test.mjs`
- `tests/security-remediation.test.mjs`
