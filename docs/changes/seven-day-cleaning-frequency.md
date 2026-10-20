# Seven-day cleaning and task contributions

Verified baseline: Ready production 0f171ae1196bf69452fe4a24c1b2ba33e1e71c66, securecleaning.com.au.

Adds `7x_week` to cleaning frequency inputs, workflow and appointment validation, quote/booking/CRM selectors, pricing settings, quote and scope labels. Existing `daily` remains 260 annual visits and is explicitly labelled 5 days per week. Seven-day recurring service uses 364 visits (52 weeks), matching the existing annualisation convention. Weekly tasks amortise by 52/364; monthly tasks by 12/364. Every-clean and as-needed remain full allowance; alternate days remain one-half.

Quote task cards now display their actual per-clean contribution alongside the task rate. Display and pricing use the same `getRoomTaskContribution` helper, which includes selection, quantity, allocated area and cadence. Display also applies the quote-wide percentage adjustment and rounds to cents without rounding each underlying task before aggregation. Unselected tasks show zero. Tasks covered by generic labour explain there is no separate charge. The filtered mopping row no longer shifts subsequent task indices.

Migration REQUIRED BEFORE application deployment:
`supabase/migrations/20261020043531_seven_day_cleaning_frequency.sql`
- Adds `7x_week` to cleaning_frequency (additive, retains daily).
- Updates both won-product creation and product-recalculation RPCs to 364 visits.
- Definitions were read from live pg_get_functiondef; only the annual-visit CASE branch changes. Existing authorization, concurrency and snapshot validation remain. ACLs explicitly retain service-role-only execution.
- No existing quote/product rows or schedules are rewritten; users choose the new schedule explicitly. The migration has NOT been applied to production.

No dependency or environment changes. API frequency enum gains one backwards-compatible value. No new endpoints or access grants.

Validation: all 615 tests, type-check, lint, production build with placeholder DB credentials, and git diff --check passed. New tests cover annual visits, weekly/monthly factors, preserved five-day behaviour, quantity/area/selection/cadence contributions, workflow JSON validation and parse roundtrip, and migration protections. Isolated PGlite database test (/private/tmp/sc-seven-day-db.mjs) applied the migration twice, confirmed enum use, denied a mismatched actor role, created a 364-visit won product and recalculated annual value, and checked grants. Scope-refresh dependency was stubbed; existing refresh authorization is unchanged. No production test writes.

Browser: actual QuoteWorkflowEditor on temporary localhost fixture with dummy data. Seven-day schedule displayed weekly $0.75 task as $0.11 per clean and monthly $7.50 area task as $0.25. Switching to five-day yielded $0.15/$0.35; changing weekly task to Every clean yielded $0.75. Temporary fixture/tab/server removed. Original user quote untouched. Screenshot /private/tmp/sc-seven-day-contributions.png. Live saving and full product workflow require release-time verification after migration; not tested with customer records.

Files: QuoteWorkflowEditor.tsx; ClientCrmWorkspace.tsx; PricingAdmin.tsx; BookingForm.tsx; QuoteResultView.tsx; StepThree.tsx; types.ts; securityInput.ts; clientCrmAppointments.ts; clientCrmQuoteDraft.ts; contractProductPolicy.ts; pricing.ts; quoteWorkflow.ts; roomTypeConfig.ts; scopeOfWorks.ts; seven-day-frequency.test.mjs; migration above; this handoff.
