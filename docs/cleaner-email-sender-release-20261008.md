# Cleaner email sender and signature release

Base: 9958e07. Applies to individual admin cleaner mail, regional-agent cleaner mail and admin network/bulk mail. No new migration, dependency or environment setting.

Cleaner From is always selected-name - Secure Cleaning <info@securecleaning.com.au>, independent of quotes FROM_EMAIL. Reply-To and CC use selected Team Access email. Shared client signature builder supplies name, title, company, phone, email and website in preview HTML/text and sent HTML/text. Existing preview fingerprints bind final content and selected sender. Missing signature feedback appears before preview; server checks completeness again.

Only owners select another active team member. Other staff send as themselves. Availability-agent contexts map to exactly one active linked Team Access account, preserving region checks and preventing sender spoofing. Owner defaults to logged-in owner. Sender changes invalidate the UI preview. Network batches snapshot sender ID, From/Reply-To/CC and signed content; continued delivery rechecks sender access and preserves queued snapshots. Existing queued records keep their saved headers.

New read-only authenticated email-senders endpoints for admin and availability-agent paths return allowed sender signature details only. Individual and network request contracts add optional senderStaffId; preview responses add From/Reply-To/CC. Shared preview modal has an optional Reply-To field. Template panel explains signatures are dynamic; no fixed staff signature is stored in templates.

Files: cleanerEmailSenders.ts; CleanerEmailDetails.tsx; two email-senders routes; two individual-email routes; cleanerEmailDelivery.ts; cleanerEmailPolicy.ts; cleaners.ts; CleanerEmailComposer.tsx; CleanerEmailTemplates.tsx; CleanersAdmin.tsx; AgentCleaners.tsx; EmailPreviewModal.tsx; cleaner-email-delivery.test.mjs; cleaner-regional-email.test.mjs; this document.

Validation: type-check/lint/full tests/production build/diff check. Focused tests cover owner selection, non-owner spoofing denial, regional state/link/active-account checks, missing signature, profile-change stale preview, rendered signature, exact archived and delivered HTML/text parity, info From with quotes environment configured, CC/Reply-To and existing replay/queue/rejection/unknown delivery semantics. Provider calls in tests are mocked; no customer emails sent.

Production preflight: Resend domain securecleaning.com.au is verified (read-only API); owner and both linked active agents have complete signature fields. Existing batch RPC persists complete delivery JSON and allows the new fields. Recent two-day stored cleaner mail records show one sent and no failed entry; bounded one-hour runtime error query returned no entries. This does not establish that the user-reported failure never occurred; no specific send failure was reproduced. Real provider acceptance/inbox delivery remains untested by this release.
