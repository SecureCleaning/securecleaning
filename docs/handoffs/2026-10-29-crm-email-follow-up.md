# CRM email follow-up

Status: implemented and locally validated; not migrated or deployed. User requested implementation, not deployment.

Source checkout: /Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602
Verified production baseline: 6912351cc0b1391819506ca7c0198c2410056013 (Ready dpl_EjdSX9cbua1j3v5kty8YEfAUt7JM).

## User workflow

In Client CRM Activity, select Follow up beside a sent email. The existing composer loads the shared, editable Did you receive my email? template, retains the original subject with Re:, and identifies the selected earlier email. Staff can edit wording, choose another template, remove the earlier email, and set a further reminder. Preview is required before sending. The outgoing message quotes the selected archived message as safe text with its sender, recipient, sent date and signature; attachments are not resent. Activity records which email was followed up.

The default wording is editable through the existing Client CRM Templates page. Existing admin/agent template permissions apply. This uses the site's existing Resend sending integration and site email history, not unrelated messages sent directly in Resend. It does not fabricate RFC Message-ID/In-Reply-To headers from Resend API IDs; inbox threading is not guaranteed. The original email content remains available regardless of inbox grouping.

## Changed files and contract

- src/components/admin/ClientCrmWorkspace.tsx: activity action, composer reference, template loading, history relationship label, clear successful send draft.
- src/lib/clientCrmEmail.ts: validate selected original after opportunity authorization, quote it, bind it into preview fingerprint, persist reference and audit metadata.
- src/lib/clientCrmData.ts: include followUpToId in communication read model.
- src/lib/crmEmailFollowUp.ts: subject and safe original-message rendering/validation.
- tests/crm-email-follow-up.test.mjs: helper and actual preview/send integration with fully mocked database/provider.
- tests/crm-email-follow-up-db.mjs: isolated PGlite migration tests.
- supabase/migrations/20261029024001_crm_email_follow_up.sql: nullable follow_up_to_id, relationship guard, editable shared template and initial version.

Existing email.preview and email.send actions accept optional followUpToId. Missing/null means normal email. A selected original must be sent, have a valid sent timestamp/body, and match the authorized opportunity, contact and current recipient. Suppression, sender authorization, unresolved-send protection, idempotency and preview validation remain in the existing send path. No new public endpoints or permissions. The history reference intentionally has no FK so archived/deleted CRM records are not blocked; the database validates new references and prevents changing an established reference. Existing table RLS/grants remain unchanged.

## Release prerequisites

Apply migration before deploying application code: the workspace read now selects the new column and the send snapshot writes it. Review/apply through release coordinator only. No environment changes or new project dependencies. PGlite is temporary external test tooling, not an application dependency. No customer writes, emails, SMS, or payment changes were made.

## Validation

- npm run type-check: passed.
- npm run lint: passed, no warnings/errors.
- npm test: 670 passed, zero failed/skipped.
- npm run build: passed using synthetic configuration.
- git diff --check: passed.
- PGlite migration test: passed including repeat application, same-contact/recipient checks, immutable reference, deletion compatibility and denied public access.
- Browser: rendered actual ClientCrmWorkspace locally with mocked fixture data; clicked Follow up, verified template/subject/editor, opened preview and verified reference. Sending was blocked by the fixture and never attempted. Screenshot /tmp/sc-followup-ui/verified.png.

Limitations: no production verification until deployment; the browser fixture mocks preview output, while integration tests independently exercise real preview/send rendering. Old messages are quoted in plain text to avoid old tracking images/active HTML; attachments are not resent. Only messages recorded as sent in CRM Activity can be selected.
