# HANDOFF.md

## Project
Secure Cleaning Aus is a Next.js 14 commercial cleaning portal for Secure Contracts Pty Ltd. It provides a public marketing site, online quote flow, booking flow, AI chat assistant, and an internal admin area for content, pricing, availability, quotes, bookings, sites, reporting, and workflow operations.

## Current status
The project is scaffolded and materially built beyond MVP landing pages. Core quote and booking flows exist, database schema and follow-up migrations exist, and a functional admin surface has been added. It appears ready for external code review and continued implementation, but not yet production-hardened in every area.

## What is finished
- Next.js 14 app structure with App Router and TypeScript
- Public site pages: home, services, cities, about, contact, FAQ
- Quote flow with pricing engine, persistence, quote reference retrieval, and email hooks
- Booking flow with prefill from quote data and scheduling-related logic
- AI chat endpoint and chat widget
- Admin area with dashboard sections for quotes, bookings, clients, sites/leads, owner-operators, pricing, availability, audit/reporting-related panels
- Supabase base schema plus additional SQL migrations
- Deployment/setup documentation and environment example file
- Project-local git history included in this package

## What is partially built
- Admin auth is still lightweight and should be upgraded before scale
- Dispatch / inspection / operator workflow surfaces exist but likely need deeper business-process completion
- CRM states and back-office workflow automation need further refinement
- Contact form is/was noted as a placeholder in scaffold notes
- Google Calendar integration exists but depends on correct env setup and live verification
- Some features appear review-ready but still need end-to-end production verification

## Known bugs / risks / caveats
- Password-only admin protection is not sufficient for serious production use
- Email, calendar, and AI features depend on environment variables and third-party accounts being correctly configured
- No proper automated test suite was found
- Quote calibration note indicates one pricing assumption should be reviewed before go-live (`QUOTE_CALIBRATION_NOTES.md`)
- There may be unfinished workflow edges around dispatch, reporting, and admin operations

## Highest-priority next steps
1. Replace password-only admin access with proper authentication/authorization
2. Add automated tests for quote, booking, and admin-critical flows
3. Verify all third-party integrations in a staging/production-like environment
4. Tighten and document workflow rules for leads, sites, inspections, and operator assignment
5. Review pricing calibration notes before public launch
6. Perform security, data-handling, and external compliance review before production rollout

## How to run locally
1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env.local`
3. Fill in required variables with your own credentials (do not use production secrets casually)
4. Set up Supabase and run SQL files beginning with `supabase/schema.sql`, then the additional migrations
5. Start dev server:
   - `npm run dev`
6. Optional checks:
   - `npm run lint`
   - `npm run type-check`
   - `npm run check-env`

## How to build / deploy
- Build:
  - `npm run build`
- Start production server:
  - `npm run start`
- Recommended hosting appears to be Vercel
- Set all required environment variables in the deployment platform
- Apply Supabase schema + migrations before verifying production flows
- See also:
  - `README.md`
  - `DEPLOYMENT_NOTES.md`
  - `VERCEL_DEPLOYMENT.md`
  - `GOOGLE_CALENDAR_SETUP.md`

## Package manager
- npm (`package-lock.json` present)

## Main framework / stack
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase
- Resend
- Anthropic API
- Google Calendar API

## Git context
- Branch: `main`
- Latest included commit: `93edd74fcaecd701a620dd601dc6c55632efbe3f`
- Commit message: `Fix admin auth flow and settings save reliability across browsers`

## Things to be careful not to change accidentally
- Quote pricing logic in `src/lib/quoteEngine.ts` without reviewing business calibration notes
- Admin workflow assumptions tied to Supabase schema and migrations
- Public copy/business positioning around the owner-operator model
- Environment-variable boundaries: never expose service-role or private API keys to the client
- Database schema / RLS assumptions without checking dependent admin and API code

## Included docs / business materials
- Root project docs and setup notes from the app
- Business plan copied into `docs/BUSINESS_PLAN.md`

## Exclusions from this package
- `node_modules`
- `.next`
- `tsconfig.tsbuildinfo`
- `.env.local`
- Other generated build/cache artifacts
