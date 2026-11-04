# Telemarketing portal refinements and appointment requests

Release owner: SC Deploy. Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Base: `dfd893672fe5bfc5f4c40c2634966682db7a1ab9`, verified Ready production deployment `dpl_AQhVeP89Mn2B6q8i7XUdBgxDEYXV`, project `openclawsecurecleaning`, scope `lyles-projects-1cf7cd8c`.

User authorization: “once this is tested and ready, migrate commit and deploy through sc deploy please.” This supersedes the earlier ready-only handoff. Include all ready intended project work per coordinator rules.

## Result

Includes all changes documented in `telemarketing-booking-refinements-20261104.md`: calendar scroll/focus, five weekday columns, scoped street lookup, and internal notes in staff email only. The earlier patch is superseded by this cumulative release.

After suburb search, **Request another time** opens the normal contact/address form plus one to five proposed weekday times (tomorrow through 90 days, ten-minute duration). Routing uses permitted active calendars and suburb coverage first, then existing booking priority. It does not choose an excluded calendar. No proposed time reserves a calendar or appears as a confirmed booking.

The client receives a TBA acknowledgement without a calendar attachment. The agent and admin receive all booking details, internal notes, and tentative transparent calendar requests. Each option has a stable UID. Accepting an email/calendar invitation alone does not approve the booking; the message links to the review screen and explains this.

Admin Overview and the assigned agent Dashboard have **Appointment requests** controls. The agent selects one option and confirms, or declines with an internal reason. Confirmation rechecks internal appointments, sale inspections and configured Google free/busy, including travel allowance; published availability windows are deliberately overridden by agent approval. A transaction checks the unchanged config, ownership, current request, and database conflicts under the existing shared advisory lock. It updates the booking, claims delivery and logs the decision atomically. Duplicate decisions do not resend.

Confirmation sends customer and agent notices, a customer invite, the selected staff invite update, and cancellations for alternative staff options. A configured Google calendar receives a deterministic event update/insert with no customer attendees. Internal notes remain in staff-only messages/calendar data. Declining cancels the requested booking and staff options, and tells the customer the time remains TBA. Internal reasons are not disclosed to customers.

Pending requests cannot be modified/confirmed through old dispatch screens. The dashboard review controls are the authoritative path. Existing bookings and client assignments are untouched. Recent decisions retain selected time, date and reason. Uncertain delivery/calendar status is flagged for a team check rather than retried automatically.

## Files and contracts

- New request policy/create/review/message/HTTP services: `src/lib/partnerAppointment*.ts`.
- New POST `/api/partner-booking/appointment-requests`: normal details plus `proposedTimes`, `customerConfirmed`, UUID idempotency key; returns `pending: true` receipt.
- New GET/PATCH `/api/admin/partner-requests` (staff/manager/owner) and `/api/availability-agent/[assigneeId]/partner-requests` (matching authenticated agent or staff admin, scoped to that agent).
- `src/components/partner/PartnerBookingPortal.tsx`, new `PartnerAppointmentReview.tsx`, admin and agent dashboard pages.
- `src/lib/types.ts`: optional requested times and `partner_request` booking source.
- Availability response adds only `requestAgent` display name; no private identifiers/events are exposed to partner callers.
- Tests: new `tests/partner-appointment-requests.test.mjs`, existing partner/security tests; extended `scripts/test-partner-booking-migration.mjs`.
- Other changed files listed in the earlier refinements handoff.

## Migration and release order

Apply forward migration `supabase/migrations/20261103234059_partner_appointment_proposals.sql` before deploying the application. It depends on the already-deployed `20261103101314_partner_booking_portal.sql`. It adds request kind/proposals/decision/delivery metadata to the existing private requests table, preserves its RLS, replaces the existing creation RPC compatibly, adds a reviewed-decision RPC and a pending-booking guard. All functions remain SECURITY INVOKER, service-role only. No destructive/backfill operation, new dependency, required environment variable, or account permission change.

Local PostgreSQL fixture applies the baseline migration and new migration with a real booking-status enum. It verifies normal creation/replay, contact/CRM rollback, permission revocation, calendar conflicts across entry points, proposed requests without reservations, pending mutation prevention, ownership, duplicate decisions, conflict rollback, declines, and anon/authenticated denial.

## Validation and limits

Final command results and patch hashes are supplied in the coordinator handoff. Browser verification used actual React components on localhost behind a proxy that intercepted all APIs. It completed a two-option synthetic request, verified the TBA receipt, selected/confirmed one option in the agent component, and verified queue removal plus decision history. No live database, calendar or email was used. Temporary fixture page removed before final build.

Screenshot: `/tmp/sc-appointment-request-local-test.jpg` (synthetic data only). Earlier browser evidence in the refinements handoff covers calendar layout, focus, street lookup and normal booking review.

No end-to-end production email or external calendar mutation was performed. Email/calendar payloads and failures are tested with capture mocks. Existing Google connection configuration remains necessary for direct external-calendar creation; without it, portal booking plus emailed invite still exists and delivery/sync problems are flagged. Calendar free/busy cannot provide a distributed transaction with Google; the database conflict check is atomic across app booking writers.

Notifications are claimed before delivery. A crash/uncertain provider outcome is intentionally flagged for manual provider/calendar inspection; no automatic resend button is provided. Pending initial notifications must finish before review, avoiding out-of-order tentative/confirmed invitations. Historical already-sent customer notes are not retracted.

Final local validation: `npm run type-check`, `npm run lint`, `npm test` (742/742), `npm run build`, `git diff --check`, and the isolated PostgreSQL migration script all passed. Build used `NODE_OPTIONS=--max-old-space-size=8192` and synthetic Supabase values; an initial default-heap build exhausted memory. No package/config change is needed. Final logs: `/tmp/sc-proposal-{typecheck,lint,all-tests,build-final}.log`.
