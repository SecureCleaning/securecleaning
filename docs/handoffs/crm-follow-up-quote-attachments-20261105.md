# CRM follow-up quote attachments and complete earlier messages

Ready for the next authorized SC Deploy release. This request implements the feature; it does not request a deployment. No commit, push, migration, production write or real email send was performed.

## Baseline and ownership

- Source: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
- Verified production and source HEAD: `728e1494ced24af27abbc23d73fbbf813f3bf20f`.
- Vercel Ready alias verified independently using CLI build logs; origin/main fetched and matched. Checkout was clean before this work.
- Ownership notified to SC Deploy before editing, including shared email preview and the client CRM route. No changes to `email.ts`, quote publishing/sending, SMS, or database functions.

## Behavior

- An unchecked **Attach quote again (PDF)** option appears in the client email composer when a matching saved sent quote is available. Quote follow-ups attach that exact sent version. Other client emails can choose among this recipient's accessible sent quote versions.
- Preview shows the attachment filename and an authenticated PDF preview link. The attachment contains the saved client price and scope, rooms/tasks, inclusions and exclusions. It does not contain internal calculations or staff commentary.
- The server checks opportunity access, quote linkage, recipient, document version and saved snapshot again. Attachment identity and its SHA-256 digest participate in the preview fingerprint. Changing selection or saved content requires a fresh preview.
- Email history retains the attached quote reference, version and filename in the final message snapshot; the send audit additionally records the send ID and PDF digest. Existing claim, suppression and uncertain-delivery protections remain in place.
- Quote follow-ups include all visible text from their saved email HTML, rather than only the quote reference. HTML is converted to escaped text; tracking images, scripts and old capability links are not replayed.
- For legacy quote emails without a snapshot, the app can retrieve the exact saved provider message ID from Resend. It checks ID, recipient and quote reference and performs a GET only. It never searches unrelated mail, writes a historical backfill or sends an email during preview.
- If the old message cannot be retrieved, a visible preview warning explains that only its reference and sent details are included. A saved quote document can still be attached. Missing history is not reconstructed from the current quote.
- A follow-up of a CRM follow-up retains the prior message chain from its final text snapshot, excluding the old protected unsubscribe footer. Empty sender angle brackets are removed.
- Preview layout now keeps its scrollable email area above the fixed action row, including when attachment details and warnings use more vertical space.

## Files

Modified:
- `src/app/api/admin/client-crm/route.ts`
- `src/components/admin/ClientCrmWorkspace.tsx`
- `src/components/admin/EmailPreviewModal.tsx`
- `src/lib/clientCrmEmail.ts`
- `src/lib/crmEmailFollowUp.ts`
- `src/lib/crmQuoteActivity.ts`
- `tests/crm-email-follow-up.test.mjs`

Added:
- `src/lib/crmEmailArchiveText.ts`
- `src/lib/crmQuoteAttachment.ts`
- `tests/crm-email-archive-text.test.mjs`
- `tests/fixtures/crm-follow-up-quote.mjs`
- This handoff.

## API, migration and environment

- Email preview/send accepts optional `quoteAttachmentSendId`. Preview adds optional `attachments` metadata and `warnings` arrays. Existing callers are compatible.
- Authenticated `GET /api/admin/client-crm?opportunity=...&quoteSendId=...&format=pdf` returns the saved quote PDF with private/no-store headers and rate limiting.
- No new database migration, packages or environment variables. Requires the already-deployed quote-history snapshot migration from the baseline.
- Optional legacy recovery uses the existing `RESEND_API_KEY`; it needs permission to retrieve the specific sent email. A missing provider ID, expired/unavailable message, denied read, timeout or recipient/reference mismatch falls back to the visible warning. No credentials were changed or printed.
- Resend retrieval contract checked against its official documentation: https://resend.com/docs/api-reference/emails/retrieve-email.

## Validation

- `npm run type-check`: passed.
- `npm run lint`: passed, no lint warnings/errors (Next lint command deprecation only).
- `npm test`: 798 passed, zero failures. Fixture fetch rejects unexpected external hosts. The suite requires permission to open its own temporary localhost server.
- `npm run build`: passed with synthetic database URL/keys and `NODE_OPTIONS=--max-old-space-size=8192`. The first default-heap attempt exhausted the local 2 GB Node heap; no source/build configuration was changed to bypass checks.
- `git diff --check`: passed.
- Focused cases cover opt-in/no attachment, actual base64 PDF send payload, exact saved price/version, internal-data exclusion, fingerprints, missing archives, unauthorized/unlinked/wrong-recipient rejection, prior-message chains, and provider read failures/mismatches.
- Visually inspected both pages of a synthetic long-scope PDF, including final paragraph/inclusions/exclusions.
- Rendered the actual email preview component with synthetic data in an isolated browser at 1280x800 and 768x900, with external requests blocked. Verified the last paragraph can be reached, the iframe ends above the controls, and send controls remain visible.

## Release checks / limits

- Editing complete. Coordinator should reconcile this patch against the independently verified current production commit before committing/releasing.
- Actual live recovery of the screenshot's October message was not attempted; its availability depends on the saved provider ID, provider retention and key permissions. Do not promise that every historical message is recoverable.
- No authenticated production attachment/sending test was performed. After release, verify the opt-in, PDF preview and complete-message preview read-only as admin/agent. Do not press Confirm & send or change real customer data without explicit authorization.
