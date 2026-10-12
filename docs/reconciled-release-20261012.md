# Reconciled release - 12 October 2026

Prepared on GitHub main 70501f09 in an isolated clone. Production currently serves
f6ce40a9 following rollback; this candidate retains the security fixes in main.
Old dirty worktrees and incomplete temporary release directories were preserved.

Changes: bounded server Supabase fetches and safe staff login errors; CRM suppression
reason/source/dates and read-only status note; SMS idle health-check reuse and
combined lease-release checkpoint writes. No automatic request retries added.
Coordinator owns integration, including the narrow shared supabase.ts change.

No new migration or dependency change. Production security migration is already
installed as 20261011213515 security_medium_low_remediation. Do not reapply it.
Read-only catalog checks confirmed both individual-email columns, all five
suppression projection columns, the quote bounds trigger, fixed-search-path
service-only limiter and bounds functions. CRM adds suppression metadata to its
existing authorized response; existing suppressed boolean and scope retained.

Validation: type-check, lint, 557 tests, production build (synthetic Supabase env),
git diff --check passed. Real isolated PostgreSQL test passed with 16 connections
and 1,596 scheduled requests. Synthetic HTTP test verifies 1 MiB upload, response
body cancellation, no write retry and uncertainty after a committed write.
Source and integration review preserve existing CRM follow-ups, editing, region
and security controls. No real email/SMS or customer writes performed.

Limitations: 15 seconds is per database/storage request, not aggregate endpoint
or transaction cancellation. A write may commit before its response times out;
reconcile state before retrying. Local browser verified the staff form exits Checking with a safe unavailable
message and re-enables submission against dummy configuration. Live authenticated
login, storage upload and CRM
role smoke checks remain necessary. Local concurrency is not a production load
test. Database restart restored service; exact outage cause remains unproven.

Release order: verify recovered database and installed migration, stage this
coherent candidate without assigning production domains, check authenticated
staff/agent login and authorization, then promote the tested build. Do not
blindly re-promote 70501f09. Keep the existing migration on application rollback.

Timing: user's earlier restriction is after 18:00 Australia/Melbourne on
2026-10-12 (07:00 UTC). Later request authorizes commit, migrate and deploy, but
whether it replaces the time restriction is pending clarification. No push,
cloud deployment, promotion or production mutation before timing is resolved.
