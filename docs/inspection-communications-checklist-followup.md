# Inspection communications and site checklist handoff

## Scope completed

- Added an optional client availability-request email before an inspection is booked.
- Added separate rich-text client and cleaner confirmation emails with mandatory server previews.
- Preserved exact staff-selected appointment times without public-availability enforcement.
- Added a direct Google Calendar upsert for the sending staff member's configured availability calendar, with an emailed ICS copy as the fallback.
- Added editable owner/manager defaults for all three inspection emails. Assigned agents can edit the current messages before previewing and sending.
- Added a pre-filled A4 new-site checklist, printable PDF, and post-handover private JPG, PNG, or PDF archive.
- Added immutable communication and checklist-upload history, server-side sale access checks, rate limits, audit events, and idempotent availability-email claiming.

## Required rollout order

1. Apply `supabase/contract_sale_invoice_terms_revision_migration.sql` if it is not already present in the connected database.
2. Apply `supabase/contract_sale_inspection_communications_checklist_migration.sql`.
3. Deploy the application release containing these changes.
4. Verify one owner and one assigned agent against a non-production or controlled sale before sending live emails.

The application reads the new inspection template, calendar, checklist, and upload columns while loading Product Sales. Deploying before the migration will make that workspace fail to load.

## External prerequisites

- Direct calendar creation requires `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN`.
- An agent must have an active availability-assignee link with a calendar ID. Owner/manager sends fall back to `GOOGLE_CALENDAR_ID`.
- When a direct calendar write is unavailable, the inspection remains scheduled and the staff email includes the same ICS invitation as a safe fallback.
- Resend and Supabase credentials remain server-only.

## Validation completed

- `npm run type-check`
- `npm run lint`
- `npm test` (345 tests)
- `npm run build`
- `git diff --check` using the bundled fallback Git binary because Apple Git is blocked by the unaccepted Xcode licence
- Rendered and visually inspected all three sample checklist pages at 130 DPI

No database migration, email, calendar event, file upload, or production deployment was performed during implementation.
