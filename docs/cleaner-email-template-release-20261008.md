# Cleaner email template management

Integrated on b9a57d9. Adds shared template create/edit/archive/reactivate in the admin cleaner directory. Saved active templates flow into both existing individual and network email selectors; archiving preserves an already composed draft. Saving does not send an email. Suggested greetings use first name only.

Files: CleanerEmailTemplates.tsx, CleanersAdmin.tsx, CleanerEmailComposer.tsx, cleanerEmailTemplates.ts, api/admin/cleaners/templates/route.ts, cleaner-email-templates.test.mjs and this document.

Compatibility changes: await current asynchronous authorization; viewer reads/staff writes; cross-origin and payload-size checks; keep rich editor disabled while saving; retain archived draft selector options. Network composer supports a narrower set of merge fields than individual cleaner emails; panel explains this and existing preview validation rejects unsupported fields.

No migration, dependencies or environment changes. Production cleaner_email_templates columns verified, RLS enabled/no browser policies, service-role access present. Existing cleaners/rich-email composer migrations are prerequisites.

New authenticated GET and staff POST /api/admin/cleaners/templates; POST accepts id (optional), name, description, subject, body/bodyHtml/bodyDocument and is_active. HTML sanitized and merge fields validated; create/update audited. Full integrated suite: 488 tests, type-check, lint, production build, whitespace check. Storage mocked tests cover create/update/reload/archive/audit; actual route test covers awaited authorization denial and success.

Verification must not send email. Live smoke may create an archived verification template and reload it. Concurrent template edits currently use last-save-wins; audit logging retains existing best-effort behavior.
