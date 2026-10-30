# Queensland booking and CRM setup - 30 October 2026

User approved Brisbane, Gold Coast and Sunshine Coast. Source checkout: b3b0. Baseline independently verified Ready at b8c0d92a2ba2c53506c49ff00adf36f0ab8e98a0 (dpl_as3uzAMLkvgavXyTryCxPFqoVwXW); clean before edits. This is a readiness handoff, NOT authorization to deploy. No live writes, agents, appointments or messages created.

## Behaviour

The existing City key represents service regions (Sydney/NSW and Melbourne/VIC). Add `brisbane` for Queensland, labelled Queensland in the public quote/booking and admin controls. Three separate booking zones: Greater Brisbane, Gold Coast, Sunshine Coast (including Noosa). This does not create marketing landing pages or change existing NSW/VIC marketing copy.

- 3,407 Queensland delivery locality records, separate from the preserved 7,896 NSW/VIC records.
- 191 unique booking postcodes / 193 zone memberships: Greater Brisbane 144, Gold Coast 20, Sunshine Coast 29. Two boundary postcode overlaps; at most two zones per postcode.
- Coverage first, availability/conflict checks second, admin booking priority third. Queensland always uses priority; Melbourne mode and Sydney behaviour unchanged.
- Separate internal calendars by assignee; when Google integration is enabled, Queensland agents require specific nonshared calendar IDs. No Google credentials invented.
- No agent or working hours created. Admin must create/link a Queensland availability profile and staff account, set priority and select coverage on that agent's windows. No slots are offered without an eligible active agent/window.
- Queensland local time uses Australia/Brisbane in appointment creation, feeds, dashboard, email/calendar labels and SMS time-zone mappings. No messages are sent by migration.
- CRM intake, postcode validation, CSV (brisbane/QLD/queensland), site edits, quote generation, cleaner access and product-state authorization support Queensland. Agents remain state/profile scoped.
- Queensland base quote multiplier is 1.00 (the engine's existing neutral fallback), editable in Pricing. Owner should review rates before opening availability.

## Coverage sources and limits

Localities: https://github.com/schappim/australian-postcodes (australian-postcodes.json, retrieved 2026-10-30), Delivery Area category only, deduplicated. D'Aguilar 4514 omitted from that register was separately verified with https://auspost.com.au/postcode/d%27aguilar-4514 (coordinates intentionally absent).

Boundary method: ABS 2026 SAL representative points intersected against Greater Brisbane GCCSA and Gold Coast, Sunshine Coast and Noosa LGAs; matched names to Queensland delivery postcodes. Where a suburb name occurs multiple times in QLD, source coordinates discriminate the matching region. The Spring Creek (Lockyer Valley) point did not disambiguate through the coarser register coordinates; its postcode 4343 is already covered through neighbouring locality matches. Moreton Bay and Southern Moreton Bay Islands aggregate names have no direct postal locality match. Existing named island delivery localities are mapped separately. Postcodes can cross official boundaries, so this is postcode-based service coverage rather than strict polygon enforcement. No Townsville, Cairns or Toowoomba city-wide coverage.

Official geography endpoints: https://geo.abs.gov.au/arcgis/rest/services/ASGS2026/GCCSA/MapServer/1, https://geo.abs.gov.au/arcgis/rest/services/ASGS2026/LGA/MapServer/1 and https://geo.abs.gov.au/arcgis/rest/services/ASGS2026/SAL/MapServer/2.

## Migrations and release order

1. `20261030055359_add_queensland_service_region.sql`: add brisbane to existing city_type. COMMIT before next migration so new enum value is usable.
2. `20261030055403_configure_queensland_booking.sql`: forward definitions of six existing routines, changing only Queensland state/time-zone branches; same signatures, security modes and existing grants. Append only missing Queensland zone IDs to availability.config. Preserve every existing agent/window/block/setting and existing zones. No customer/financial record backfill.
3. Deploy application. Verify exact production SHA and read-only configuration state. Do not test by creating real records or sending emails/SMS.

API change: city unions now accept brisbane. No new API endpoints, packages or environment variables. No live database changes made by feature task.

## Validation

Type-check, lint, full tests, production build and diff checks run with synthetic local credentials. Additional tests cover QLD locality lookup, all three service areas, excluded cities, daylight saving differences, zone-first priority, occupied-agent fallback, separate calendars and no-window behaviour. Local PGlite script applies both migrations, confirms state isolation/inactive-agent denial, verifies original config preservation, idempotency and preserved service-only EXECUTE grants on replacement. Uses check_function_bodies=off for unavailable ancillary tables; region authorization and config operations execute against real synthetic tables. Full quote/product and SMS RPC end-to-end integration is not simulated by that script; the replacements otherwise retain the current definitions.

No authenticated browser verification has been performed. React checklist reviewed: existing labelled selects/inputs and state handlers reused; no new component libraries, effects or fetch loops.

## Files

src/app/api/address-autocomplete/route.ts
src/app/api/availability-agent/[assigneeId]/route.ts
src/app/api/availability/route.ts
src/app/api/booking/route.ts
src/app/api/locality-autocomplete/route.ts
src/app/api/quote/route.ts
src/app/booking/confirm/page.tsx
src/components/admin/AvailabilityAdmin.tsx
src/components/admin/ClientCrmWorkspace.tsx
src/components/admin/ClientLeadCsvPanel.tsx
src/components/admin/PricingAdmin.tsx
src/components/admin/SitesManager.tsx
src/components/availability/AssigneeAvailabilityEditor.tsx
src/components/booking/BookingForm.tsx
src/components/quote/QuoteResultView.tsx
src/components/quote/StepOne.tsx
src/components/sms/SmsControls.tsx
src/data/australianPostcodes20260527.ts
src/lib/addressGeocoding.ts
src/lib/australianLocalities.ts
src/lib/availability.ts
src/lib/availabilityNormalization.ts
src/lib/availabilityPriority.ts
src/lib/availabilityZoneCatalog.ts
src/lib/availabilityZoneDesign.ts
src/lib/calendarInvite.ts
src/lib/cleanerAgentPolicy.ts
src/lib/cleanerPortal.ts
src/lib/clientCrmAppointments.ts
src/lib/clientCrmAssignment.ts
src/lib/clientCrmData.ts
src/lib/clientCrmEmail.ts
src/lib/clientCrmLocation.ts
src/lib/clientCrmOpportunity.ts
src/lib/clientCrmQuoteDraft.ts
src/lib/clientCrmQuotes.ts
src/lib/clientLeadCsv.ts
src/lib/contractProductPolicy.ts
src/lib/email.ts
src/lib/googleCalendar.ts
src/lib/pricing.ts
src/lib/securityInput.ts
src/lib/sitePayloadValidation.ts
src/lib/smsPolicy.ts
src/lib/types.ts
tests/availability-agent-cleaners.test.mjs
tests/availability-radius.test.mjs
tests/locality-autocomplete.test.mjs
tests/site-admin-validation.test.mjs
scripts/test-queensland-migration.mjs
src/data/queenslandPostcodes20261030.ts
src/lib/queenslandServiceZones.ts
supabase/migrations/20261030055359_add_queensland_service_region.sql
supabase/migrations/20261030055403_configure_queensland_booking.sql
tests/queensland-region.test.mjs

Final result: 698/698 application tests pass; type-check, lint, production build and git diff --check pass. Final build exit 0. PGlite migration test also passes. Logs `/tmp/qld-types.log`, `/tmp/qld-lint.log`, `/tmp/qld-tests.log`, `/tmp/qld-build.log`. Editing complete and ready for coordinator review; no deployment requested in this turn.

## Coordinator release validation

User authorized migration, commit and deployment through SC Deploy. Integrated from frozen b3b0 onto verified production/main b8c0d92. Coordinator type-check, lint, 698 tests, isolated PGlite migrations, production build and diff check pass. The six live routine bodies were compared with this migration: only the intended Queensland state/time-zone branches differ; service-role-only EXECUTE grants preserved.

Supabase connector applied the migrations in separate committed transactions. Database history versions are 20261030091341 (add_queensland_service_region) and 20261030091431 (configure_queensland_booking), corresponding to repository migration files 20261030055359 and 20261030055403. Existing non-zone config and NSW/VIC zone hashes are unchanged. Three QLD zones have 144/20/29 postcode memberships. Security advisor findings are unchanged from before release; existing search-path and GraphQL schema-discovery advisories remain separate follow-up work. No customer records or messages created during verification.
