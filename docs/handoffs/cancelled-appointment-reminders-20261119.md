# Cancelled appointment reminder cleanup

Baseline: verified production b4915f8f5b0356c9e1dadf5d9acf8b343af2cd42.

Cancelled CRM/manual and partner appointment-only records (explicit null quote_id) are treated as closed in the dashboard queues, action cards and counters. Stored booking status is preserved, including the user's manual confirmation changes. History/all queues retain the records. Quote-linked service bookings and unknown/legacy sources remain active under existing rules; unrelated CRM follow-up dates are untouched.

The booking list and refresh payload add quote_id for this distinction. Reporting also reads inspectionBookingSource. No permissions, public endpoints, dependencies or environment variables change.

Apply migration 20261119015650_cancelled_appointment_reminders.sql through SC Deploy. It cancels only never-attempted queued/leased appointment SMS for cancelled bookings/inspections, both existing and future. It preserves delivered/submitting/unknown/review history and unrelated messages. Status-only inspection cancellations are checked at dispatch, even if old dates remain. The existing confirmation-only, opt-out, receipt and quiet-hour rules remain. Trigger functions are invoker-security with explicit service-role-only execution.

The trigger skips job rows locked by an active dispatch transaction to avoid reversing the dispatch job/booking lock order. Dispatch checks cancellation under the booking lock; already handed-off messages cannot be recalled. Test actual concurrency in a separate PostgreSQL environment if desired; the isolated PGlite fixture covers the forward rollout, queued/leased cleanup, dispatch guard, sale inspections, history preservation and permissions, not multi-session locking.

Validation: full npm tests, type-check, lint, build and diff check; isolated database command:

    PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-inspection-sms-database.mjs

No production writes, real cancellations or sends performed. No live browser mutation test. Apply migration before or with the application release. Reverify production and current function definition before integration; do not replay earlier mapped migrations.
