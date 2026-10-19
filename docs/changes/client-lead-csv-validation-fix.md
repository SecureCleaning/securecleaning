# Client lead CSV validation follow-up

Baseline: live Ready deployment dpl_2NqMRqnyLCjz1CxKWv5opXLx6fR7 / commit 65b627aa3fa07711a3e03c98fbbe9a91b868cc92, verified 20 October 2026 from Vercel alias and build log. Checkout and origin/main matched; no pre-existing edits.

Changed src/lib/clientLeadCsv.ts, src/components/admin/ClientLeadCsvPanel.tsx and tests/client-lead-csv.test.mjs.

- Blank/omitted first_name becomes Manager before validation and import; supplied names remain unchanged. Preview now shows the contact's name alongside the business.
- Source and contact-basis choices accept internal codes and readable CRM labels, ignoring case, spaces and hyphens. Unknown or blank contact basis still requires correction rather than inventing contact permission. Provider requirements remain enforced.
- Childcare centre/center and child care variants resolve to the existing childcare catalog entry. Exact catalog matches take priority; inactive options remain blocked.
- Validation messages list actionable values; panel documents source choices and name fallback.

No migrations, dependencies, environment or endpoint changes. Existing import preview and creation share this parser, including normalized replay keys. No live records imported or messages sent. The supplied CSV uses Official website and Public business contact. These now map to cold_outreach and inferred_business_interest, preserving source_provider and source_reference. Both actual rows pass local parser validation, with the blank name becoming Manager. No customer data was added to repository tests. Live duplicate/assignment checks remain enforced on the server. Automated tests cover representative readable labels, Manager fallback, inactive choices and provider validation. Authenticated browser test not performed.

Validation: type-check, lint, all 611 tests and git diff --check passed. Final production build also passed after adding the actual-file mappings (placeholder public Supabase URL/key). No deployment requested; ready work should route through release coordination.
