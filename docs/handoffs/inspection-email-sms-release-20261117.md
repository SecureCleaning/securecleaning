# Inspection email SMS release

User authorized migration, commit and deployment through SC Deploy on 17 November 2026. Source feature handoff inspection-email-sms-20261117.md describes implementation and original pre-authorization status. All ready work across six current folders was reviewed; only this feature was pending. Baseline main/live c44431bc8c1a12affd6afe0041605440383d68aa.

Repository migration 20261116231302_inspection_email_sms.sql applied through Supabase connector as database history 20261116233719, name inspection_email_sms. Do not replay due to timestamp differences. Prior live dispatch body MD5 matched 24a0ebd5f4b68863d13bedb909a96463. Post-migration verification: RLS enabled, anon/authenticated table access denied, anon RPC denied, service RPC allowed, zero receipts and jobs. No backfill or live sends.

Coordinator validation passed: 852 tests, type-check, lint, isolated PGlite database tests, production build and git diff --check. No dependencies/environment changes. Live delivery not tested: no customer test sends authorized. Existing automatic settings apply only to future eligible inspection emails after rollout. Existing STOP/email-only/quiet-hour and reconciliation protections retained.
