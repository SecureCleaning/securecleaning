# Secure Cleaning Deployment Notes

## Core environment variables

### Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CONTENT_ADMIN_PASSWORD`

### Email
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `NEXT_PUBLIC_SITE_URL`

### Optional / feature-based
- Google Calendar integration envs used by `src/lib/googleCalendar.ts`

## Database migrations to apply
Apply these in Supabase SQL editor or migration workflow:

1. Base schema
- `supabase/schema.sql`

2. Sites extension
- `supabase/sites_migration.sql`

3. Audit log extension
- `supabase/audit_log_migration.sql`

4. Inspection / dispatch workflow extension
- `supabase/inspection_workflow_migration.sql`

5. CRM follow-up extension
- `supabase/crm_followup_migration.sql`

## Pre-build environment validation
Run:

```bash
npm run check-env
```

## Post-deploy verification checklist

### Public flows
- [ ] Homepage loads
- [ ] Quote form submits
- [ ] Quote email sends
- [ ] Quote result page loads via `/quote/[ref]`
- [ ] Booking form submits
- [ ] Booking auto-links or auto-creates site
- [ ] Booking email sends

### Admin flows
- [ ] Admin unlock works
- [ ] Content editor saves
- [ ] Pricing editor saves
- [ ] Availability editor saves
- [ ] Sites page create/edit works
- [ ] Booking status updates work
- [ ] Quote status updates work
- [ ] Site assignment works
- [ ] Operator assignment works
- [ ] Audit log records events
- [ ] Alerts panel loads
- [ ] Reporting panel loads
- [ ] Admin notification emails send for new quotes/bookings

### Data checks
- [ ] quotes table receiving records
- [ ] bookings table receiving records
- [ ] sites table populated
- [ ] leads table populated
- [ ] admin_audit_log receiving entries

## Launch cautions
- Ensure `FROM_EMAIL` domain is verified in Resend
- Ensure service role key is never exposed client-side
- Ensure admin password is strong and private
- Consider replacing password-only admin with proper auth before scale

## Recommended next production improvements
- Full auth for admin users
- Automated tests for quote + booking flows
- Better operator dispatch workflow
- Dedicated site/inspection scheduling UI
- Notification alerts for new bookings/quotes
