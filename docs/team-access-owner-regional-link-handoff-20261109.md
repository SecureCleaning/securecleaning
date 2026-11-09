# Owner regional profile linkage

Ready-work handoff from b3b0, based on independently verified Ready production and fetched main `66962cb56d699a12cf774547781b600a7ea55ec2`. No new deployment was requested in this follow-up; route this patch through SC Deploy with the next authorized release.

## Live configuration repair completed

The user requested repair of Melbourne's Team Access link, preserving existing records, then explicitly requested test emails. The existing Melbourne profile and the existing owner's work email matched uniquely. A guarded transaction linked that account to its existing Melbourne profile, preserving its Owner role, signature, password, and all other account fields. The ordinary session-revocation trigger ran and an audit event records the repair. No account was created and calendar configuration was not changed.

Read-only checksums verified cleaner records, bookings, calendar configuration, and staff roles/signatures were unchanged. The actual deployed regional sender resolver and email renderer were exercised locally with the read-only production configuration and saved template. They resolved the Melbourne owner with the correct signature, reply-to and CC.

Two explicitly authorized, clearly labelled test emails were delivered through Resend to the established owner test mailbox: the existing profile-completion email without CC, and the saved introduction with the linked Melbourne owner's CC. Existing customer/intake/email-history records were not rewritten or replayed. The private profile link was not included in the introduction or copied to the agent. Provider IDs are retained in the chat, not in source. Suppression checks passed before sending. No further test sends are authorized by this handoff.

## Prevention patch

The Team Access API previously discarded a linked profile whenever an account's role was Owner. Saving an owner's signature would therefore undo the repair. The patch permits an optional linked profile for Owner accounts, retains it when omitted during edits, validates explicit selections, and checks for another active account already linked to that profile. Regional Agents still require a valid profile. The API remains Owner-only; no role or authorization rules change.

Team Access displays the optional profile selector and existing profile/schedule links for Owners as well as Regional Agents. Its helper text distinguishes sender/calendar linkage from the owner's access role.

Files: `src/app/api/admin/staff/route.ts`, `src/components/admin/StaffAccessAdmin.tsx`, `tests/staff-regional-link.test.mjs`, and this handoff.

No migration, dependency, or environment change is required. Existing request/response fields are retained; `availabilityAssigneeId` now also supports Owners. No backfill, replay, customer email or calendar action is needed for deployment.

Validation: seven focused route tests and all 830 tests pass; type-check, lint, production build and final diff check pass. The build required a 4 GB Node heap and non-production Supabase placeholders; no production credentials were loaded for the build. Tests cover owner signature edits preserving the link and role, optional link creation/removal, invalid profiles, duplicate active links, required agent links, Owner-only mutation permissions and signature validation. No live browser account saves were performed.

Until the prevention patch is deployed, saving an Owner account through the old Team Access form can still clear its profile link. Do not reapply the production repair without first checking the current state.
