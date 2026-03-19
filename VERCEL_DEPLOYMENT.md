# Vercel Deployment — Secure Cleaning

## What is already ready
- Next.js app builds cleanly
- Supabase project is live (Sydney)
- Resend is verified and sending
- Environment variables are known

## Pre-deploy checklist
- [ ] Create / log into Vercel account
- [ ] Import the project repository or upload the code
- [ ] Add all environment variables from `.env.local`
- [ ] Set Production Domain to `securecleaning.au` or `www.securecleaning.au`
- [ ] Add DNS records at your domain registrar

## Required environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `FROM_EMAIL`
- `ADMIN_EMAIL`

## Recommended production values
- `NEXT_PUBLIC_SITE_URL=https://securecleaning.au`
- `FROM_EMAIL=info@securecleaning.au`
- `ADMIN_EMAIL=info@securecleaning.au`
- `GOOGLE_CALENDAR_ID=info@securecleaning.au`

## After deploy
1. Test homepage
2. Submit a quote
3. Confirm quote record appears in Supabase
4. Confirm quote email arrives
5. Submit a booking
6. Confirm booking record appears in Supabase
7. Confirm booking email arrives
8. Test AI chat widget
