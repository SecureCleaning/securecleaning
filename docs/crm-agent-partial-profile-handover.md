# Agent CRM partial profiles

## Result

Agents can edit the business, primary contact, and site details for CRM opportunities
assigned to them. A profile can be saved with missing names, email, phone, street
address, suburb, or postcode. Owners and managers retain their existing access.

Inspection appointments no longer require a complete contact or site record. The
booking uses the opportunity's service region and any details currently available.
The assigned agent calendar event is still created. Client confirmation is sent only
when the saved email address is valid.

## Rollout

Apply `supabase/client_crm_agent_partial_profile_migration.sql` after
`supabase/client_crm_optional_business_name_migration.sql` and before deploying the
application changes. The migration makes `clients.email` nullable and replaces
`update_client_crm_profile` with the same signature. It remains service-role only,
uses optimistic concurrency, writes the existing audit action, and permits an agent
only when `crm_opportunities.assigned_staff_id` matches the authenticated staff ID.

No dependencies or API route/action names changed. `client-record.update` now accepts
partial profile values. `inspection.create` can store a null `site_id`; booking input
strings contain the currently saved values, with a generic contact label when no name
is available.

## Verification limits

No live database migration, customer email, calendar write, or production deployment
is performed as part of the code change. Verify an authenticated agent save and an
appointment with incomplete details after applying the migration in the target
environment.
