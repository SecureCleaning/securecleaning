# Quote and service terms release — 16 November 2026

Approved customer terms are published at /quote-terms/2026-11-16 with a matching downloadable four-page PDF. Quote views link to both. Initial quote, final quote and scope resend email payloads attach the PDF and include a short terms link/explanation. No email was sent for validation.

Quote validity remains 30 days; existing saved valid_until is displayed and is not renewed on resend. Ongoing service has no fixed minimum term, 30 days notice, and fixed-term contracts on request. Insurance wording remains approved $10 million wording. Existing separately agreed arrangements are not rewritten.

Content source: src/content/quote-service-terms-2026-11-16.json. Generator: scripts/build-quote-terms-pdf.py (ReportLab authoring tool only). Generated public PDF and server-side base64 JSON must match. Published dated content must remain immutable; future amendments require a new version. Email archives retain the sent PDF payload.

Changed areas: quote terms content/page/PDF, email builders and send routes, public quote DTO and result/session propagation, regression tests. API additions are optional validUntil in quote result/public DTO. No database migration, environment changes or application dependency changes.

Validation: type-check, lint, all 843 tests, production build and git diff --check passed. All four PDF pages visually checked. Tests compare attached/downloaded PDF bytes, preserve saved expiry, and ensure preview does not send or issue capabilities. Live delivery itself is intentionally untested because the user prohibited emails.
