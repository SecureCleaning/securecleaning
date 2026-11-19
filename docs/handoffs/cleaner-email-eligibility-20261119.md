# Cleaner email eligibility and compact invitation panel

Verified live baseline 92858321553657450ea9321b90f500a4b78da8ed.

User explicitly requested that cleaner approval/workflow status must not prevent emails or broadcasts. All statuses now qualify for email selection/reservation/claim. Valid address checks, unsubscribe/global blocks, duplicate-email handling, state selection and agent authorization remain. Contract purchase/compliance requirements are untouched. Email footer no longer describes every recipient as approved.

CleanerAccessAdmin uses a native details/summary disclosure, collapsed on load. Shared owner/agent component preserves input state when toggled, keyboard access and existing send controls.

Separately completed user-authorized live correction: Abhi Patel, cleaner id 54c50270-4d7c-4884-a662-5562f7a1b6c5, changed from VIC to NSW with id/email/old-state guards. Readback confirmed NSW and no local unsubscribe/global block. He was already approved; state mismatch caused the original absence. Recorded a cleaner.state_corrected audit entry identifying the user-requested correction. No emails were sent.

Apply migration 20261119040651_cleaner_email_all_statuses.sql before/with the app. Five existing reservation/claim functions are replaced with only cleaner status predicates removed. Existing grants/security modes and all other guards retained. No backfill, queue enrolment, recipient reset or automatic resend. Existing queued recipients will use the new status-independent eligibility at their next claim; recipients already skipped/sent/uncertain are not reset. Background worker continues checking suppression/authorization at send time.

No dependencies/environment or API shape changes. Review live function definitions before applying, since concurrent SQL changes must not be overwritten.

Validation: full npm tests/type-check/lint/build/diff check and isolated PGlite script scripts/test-cleaner-email-eligibility-database.mjs. It exercises all six statuses through actual reservation and claim functions, idempotent replay, global/local suppression added after queueing, state filtering and service-only ACLs. Mocked application tests cover all statuses and retained region/suppression rules. No actual provider sends or production upload/send tests; browser disclosure interaction has not been exercised.
