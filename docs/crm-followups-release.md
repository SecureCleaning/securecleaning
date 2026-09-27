# CRM follow-ups

Integrated from origin/main cc3eba9 for the 28 September 2026 release.
Existing worktrees contain unrelated edits and were left unchanged.

## Rollout
Apply supabase/client_crm_followups_migration.sql before deploying this code.
The migration adds optional template/version/communication columns and two
service-only trigger functions. Existing table RLS and grants remain unchanged.
No default template is enabled automatically; configure Create follow-up after
sending per template. Existing stored dates are not rewritten because original
local-time intent cannot be reliably inferred. Review existing reminders locally.

## Behavior
The CRM, owner dashboard and agent dashboard display open opportunity reminders.
The authenticated CRM endpoint enforces assignment access for agents on reads and
writes. Follow-up reads page through all reminders, bypassing the normal 200-row
recent-opportunity limit. Deep links retrieve the selected authorized opportunity.
Complete clears the due time; reschedule changes it. Trigger audit retains dates.
Device-local datetime fields convert to UTC on submission and back on load.
Workflow notes are internal. Source explanation remains a client-facing disclosure.
Business-day delays skip Saturdays/Sundays (not public holidays), default 09:00.
The composer lets staff override or disable the proposed reminder. Only successful
email finalization applies it, transactionally; failed or unknown sends do not.
Existing earlier reminders take priority. Closed opportunities are excluded.
Reminder options are captured on the communication; no client auto-email is sent.
Dashboard lists refresh each minute and on focus; these are in-app reminders,
not background email or push notifications.

## Validation
Type check, lint, unit tests and production build are required.
381 tests, type checking and lint passed; the same source passed a local production build.
The migration passed a BEGIN/ROLLBACK dry run against the connected production schema,
then was applied on 28 September 2026. All six new columns were verified.
No client email was sent during validation. End-to-end email-trigger behavior has
not been tested by sending a real email.
