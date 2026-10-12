# Login outage recovery and hardening - 12 October 2026

## Production state

Production remains rolled back to deployment dpl_Hm6Js2f9KEQewcDoJ98spaysFEcX
(commit f6ce40a9). The Supabase restart restored database access and the user
confirmed NSW login succeeds. No new release or paid capacity upgrade was made.

The incident affected direct SQL connectivity as well as application requests.
The precise trigger remains unproven. The database migration from the security
release remains installed; an application rollback does not reverse migrations.

## Prepared changes

- Server-side Supabase requests have a 15-second deadline, including response-body
  consumption. Existing caller cancellation and no-store behavior are retained.
- Admin and agent login requests have a 20-second browser deadline, including JSON
  parsing. Timeout, network, rate-limit, invalid credential, and non-JSON server
  errors receive safe messages. Error messages are announced with role=alert.
- Authentication and regional authorization remain server-side. No automatic
  retries were added. A timed-out mutation may already have committed; existing
  reconciliation/idempotency behavior must still be used.
- No database migration, dependency, or wire contract changes are required.

The deadline applies to all requests made by getAdminSupabase, including storage.
Preview verification should include normal uploads and any long-running admin
operations. This is a per-request deadline, not a transaction/SQL cancellation
or an aggregate endpoint deadline.

## CRM review

The deployed ClientCrmWorkspace loads on mount and after mutations. No interval
polling loop was found in that component. A workspace refresh fans out across
opportunities, agents/senders, templates, organisations, contacts, sites, intake
links, quotes, inspections, communications, products, and suppression records.
Email bodies are fetched as part of workspace data. Reducing that load should
use paginated/on-demand communication details and narrower mutation refreshes;
it requires coordinated API/client changes and authorization regression tests.
Do not introduce shared caching of authenticated CRM responses.

## Rate limiter verification

The security release's existing integration test and migration were extracted
from commit 70501f09 into /tmp/sc-recovery-rate and executed using the existing
isolated embedded-postgres installation in /tmp/sc-security-pg-concurrency.
The test passed against real PostgreSQL with 16 independent connections,
checking subject limits, rejected-source isolation, shared capacity races,
expiry, and rollback. No production load testing or rate-limit writes were used.
This establishes correctness under that local test, not Nano production capacity.
The global advisory transaction lock serializes admission and remains a potential
contention point; a test pass does not establish or exclude incident causality.

## Capacity recommendation

Consider Pro with Micro compute (1 GB RAM) for the live application rather than
Free/Nano. Published Pro base pricing is USD 25/month and includes USD 10 compute
credit, covering one Micro project; additional projects, add-ons, taxes and usage
can change the bill. Obtain approval for the actual organization-level cost
before making any billing change. This is additional headroom, not a guarantee
against recurrence.

Sources checked 12 October 2026:
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/platform/billing-faq

## Release prerequisites

This checkout is at efddd78 with substantial existing uncommitted work and is
older than both production builds involved in this incident. Do not deploy this
whole checkout. Integrate only the resilience changes into the current release
source, run its validation suite, and verify preview login, rate limiting, agent
linkage, CRM authorization, uploads, and write-timeout reconciliation before
requesting production promotion. Do not restore the newer release solely on the
basis of the local concurrency test. Vercel automatic promotion remains paused
following rollback.

## Validation

- Focused resilience tests: 10 passed (success, proxy/non-JSON errors, credentials,
  rate limiting, missing linkage, request/body stalls, cancellation, no retries).
- Type check: passed.
- Lint: passed, no warnings.
- Unit suite: 256 passed.
- Isolated PostgreSQL concurrency test: passed.
- Production build: passed (existing Next.js SWC minifier deprecation warning).
- git diff --check: passed.
- The modified forms have not been tested in a live authenticated browser session.
  No deployment was performed; the user's successful production login used the
  recovered database and existing rolled-back application.
