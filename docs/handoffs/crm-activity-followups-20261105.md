# CRM reminders after inspections and sent quotes

Editing complete. Ready for the next authorized SC Deploy release; the user requested implementation, not deployment in this turn. No commit or push was made here.

## Baseline and ownership

- Source: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
- Branch: `codex/client-deletion-booking-lineage-20260924`.
- HEAD, fetched main and verified Ready production alias: `728e1494ced24af27abbc23d73fbbf813f3bf20f`.
- Vercel: `openclawsecurecleaning`, scope `lyles-projects-1cf7cd8c`, alias `securecleaning.com.au`. Rechecked before handoff.
- Existing quote-attachment work remains intact; see `crm-follow-up-quote-attachments-20261105.md`. Integrate both intended features without overwriting overlapping `ClientCrmWorkspace.tsx` edits.

## Problem and resulting behavior

Booking previously advanced CRM stage only. Reminder dates remained overdue and labels looked only at email/quote history. New database triggers update the single existing reminder atomically with the confirmed activity:

- Confirmed inspection or actual reschedule: 9 am, two weekdays after the inspection, in its site's Australian timezone.
- Successfully finalized quote (including newly linked sent quotes): two weekdays after sending. If a scheduled inspection is later, follow up two weekdays after that visit instead.
- TBA requests, drafts, rejected/uncertain sends, retries, ordinary booking edits and completion do not reset reminders.
- Cancelling the inspection that owns the current reminder changes it to a rebooking reminder for 9 am next weekday.
- Manual reschedule/completion stays editable; event timestamps stop older delayed finalizations from overwriting it. Future genuine booking/send actions can set a new reminder.
- Existing explicit CRM email reminder dates/clears still work and now share the same ordering protection.
- Closed opportunities remain unchanged. Stages, existing bookings, client assignments, calendar events, outbound delivery and template settings are otherwise untouched.
- The reminder list uses its recorded source instead of an unrelated latest email. Stale open workflow forms cannot overwrite a changed reminder without refreshing.
- Weekdays exclude Saturday/Sunday, matching the existing CRM helper; public holidays are not separately configured.

## New task files

- `supabase/migrations/20261105020935_crm_activity_follow_up_schedule.sql`
- `src/lib/clientCrmReads.ts`
- `src/lib/crmFollowUpSummary.ts`
- `src/components/admin/ClientCrmWorkspace.tsx` (helper text and expected reminder check, alongside preserved earlier feature)
- `tests/crm-followup-summary.test.mjs`
- `tests/integration/crm-activity-followups-postgres.mjs`
- This handoff.

## Migration, contracts and rollout

Apply the forward migration before the application. Adds nullable internal `crm_opportunities.follow_up_source`, `follow_up_source_id`, and `follow_up_event_at`; records source in the existing private reminder audit. New helpers/triggers are SECURITY INVOKER, fixed search path, executable by service_role only. Existing table grants and RLS remain unchanged. The source ID is a polymorphic historical reference, not a foreign key. Transactions contain no network calls.

Existing follow-up API response shape stays unchanged; the read model now reads the source columns and produces more accurate `summary` text. Workflow save adds the already-supported `expectedNextFollowUpAt` comparison. No application dependencies, environment variables or scheduled jobs added. Temporary test-only PGlite/CLI installations are outside the repository.

Migration repairs only open non-null reminders on/before their latest confirmed activity's anchor, with no later reminder audit or sent email. Null/completed reminders and later manual changes are preserved. The read-only production preview returned exactly one eligible opportunity on 5 November:

- Dixon Valve `f85a9fba-3f20-4ff4-a375-494cfc7df5e8`.
- Booking `BK-20261105-16EB78E4`, scheduled 5 November 2026 at 10 am Sydney time.
- Current reminder 5 November 9 am. Expected repaired reminder **9 November 2026 at 9 am Sydney time**, summary **Follow up after inspection**.
- Reminder was last changed before the booking was created; the other booking is cancelled and excluded.

Re-run the read-only candidate preview immediately before applying the migration: intervening manual edits should remain protected. Do not send test messages or alter actual bookings. The migration only repairs reminder metadata/dates and writes their existing audit records. No production writes were performed in this task. The Keychain Management API helper returned 401; the Supabase connector succeeded for the read-only investigation.

## Validation and evidence

- Full `npm test`: 800 passing tests, no failures.
- `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check`: passed.
- Build used synthetic configuration and 8 GB Node heap; no production credentials or service calls.
- Real isolated PostgreSQL/PGlite test passed: existing-record repair, skipped manual/closed/completed/newer-email cases, pending partner request -> approval, booking insertion and CRM linking, rescheduling, no-op saves, cancellation, quote finalization/revisions/linking, future-inspection protection, email clear/replace and failed/late sends, manual stale-order protection, NSW/VIC DST, QLD timezone, year boundaries, audit, public-role denial and service-role execution.
- Run it with `PGLITE_MODULE=/tmp/sc-reminder-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/crm-activity-followups-postgres.mjs` (or another local PGlite install).
- Logs: `/tmp/sc-reminder-{db,typecheck,lint,tests,build}.log`.
- UI change is explanatory text and existing optimistic reminder check; summary cases are tested. No live browser booking/send exercise was performed.

## Post-release verification

Confirm the exact Ready release, then read Dixon Valve's reminder and both admin/agent follow-up lists without editing. Expect Monday 9 November 9 am and the inspection label unless the user made a newer manual change. Verify unrelated reminders were retained. No customer communication is triggered by opening these pages or by the migration.
