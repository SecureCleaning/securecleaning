import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const {
  applyCrmTemplateTokens,
  buildContactSourceExplanation,
  canAccessClientCrm,
  canActorAccessAssignedOpportunity,
  getMissingCrmSignatureFields,
  hasCompleteCrmSignature,
  requiresNamedSourceProvider,
} = await import('../src/lib/clientCrmPolicy.ts')

const { buildCrmFooter, buildCrmSignature } = await import('../src/lib/clientCrmEmail.ts')
const {
  buildCrmOpportunityIdentity,
  buildCrmSiteIdentity,
  linkCrmQuoteHistory,
  normalizeCrmPhone,
  resolveCrmProvisionalPromotion,
  resolveCrmOpportunityCycle,
  resolveCrmSyncLink,
} = await import('../src/lib/clientCrmOpportunity.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

const completeAgent = {
  displayName: 'Alex Agent',
  email: 'alex@securecleaning.com.au',
  phone: '0400 123 456',
  jobTitle: 'Regional Agent',
}

test('client CRM roles and assignment access remain tightly bounded', () => {
  assert.equal(canAccessClientCrm('owner'), true)
  assert.equal(canAccessClientCrm('manager'), true)
  assert.equal(canAccessClientCrm('agent'), true)
  assert.equal(canAccessClientCrm('staff'), false)
  assert.equal(canAccessClientCrm('viewer'), false)

  assert.equal(canActorAccessAssignedOpportunity('owner', 'owner-1', null), true)
  assert.equal(canActorAccessAssignedOpportunity('manager', 'manager-1', 'agent-2'), true)
  assert.equal(canActorAccessAssignedOpportunity('agent', 'agent-1', 'agent-1'), true)
  assert.equal(canActorAccessAssignedOpportunity('agent', 'agent-1', 'agent-2'), false)
  assert.equal(canActorAccessAssignedOpportunity('agent', 'agent-1', null), false)
})

test('one customer and site reuses an active opportunity for multiple quote history rows', () => {
  const identity = { organisationId: 'org-1', contactId: 'contact-1', siteIdentity: 'site-a' }
  const existing = [{ ...identity, id: 'opportunity-1', cycleNumber: 1, closed: false }]
  assert.deepEqual(resolveCrmOpportunityCycle(existing, identity), {
    action: 'reuse', opportunityId: 'opportunity-1', cycleNumber: 1,
  })
  const first = linkCrmQuoteHistory([], 'quote-1')
  const second = linkCrmQuoteHistory([first.link], 'quote-2')
  assert.deepEqual(first, { created: true, link: { quoteId: 'quote-1', sequenceNumber: 1 } })
  assert.deepEqual(second, { created: true, link: { quoteId: 'quote-2', sequenceNumber: 2 } })
  assert.equal(linkCrmQuoteHistory([first.link, second.link], 'quote-1').created, false)
})

test('the same contact can have separate active opportunities at two sites', () => {
  const common = { organisationId: 'org-1', contactId: 'contact-1' }
  const siteA = buildCrmOpportunityIdentity({ ...common, siteIdentity: 'site-a' })
  const siteB = buildCrmOpportunityIdentity({ ...common, siteIdentity: 'site-b' })
  assert.notEqual(siteA, siteB)
  assert.equal(resolveCrmOpportunityCycle([], { ...common, siteIdentity: 'site-a' }).action, 'create')
  assert.equal(resolveCrmOpportunityCycle([], { ...common, siteIdentity: 'site-b' }).action, 'create')
})

test('a closed opportunity permits a repeat sales cycle without changing history', () => {
  const identity = { organisationId: 'org-1', contactId: 'contact-1', siteIdentity: 'site-a' }
  assert.deepEqual(resolveCrmOpportunityCycle([
    { ...identity, id: 'opportunity-1', cycleNumber: 1, closed: true },
  ], identity), {
    action: 'create', opportunityId: null, cycleNumber: 2, previousOpportunityId: 'opportunity-1',
  })
})

test('missing sites are provisional and normalization ignores case, spacing, and phone punctuation', () => {
  assert.equal(buildCrmSiteIdentity({ address: '', postcode: '3000', city: 'melbourne' }), null)
  assert.equal(
    buildCrmSiteIdentity({ address: ' 10 MAIN   Street ', suburb: ' South Yarra ', postcode: '31-41', city: 'melbourne' }),
    buildCrmSiteIdentity({ address: '10 main street', suburb: 'south yarra', postcode: '3141', city: 'melbourne' }),
  )
  assert.equal(normalizeCrmPhone('(+61) 400 123 456'), '61400123456')
  const provisional = { organisationId: 'org-1', contactId: 'contact-1', siteIdentity: null }
  assert.equal(resolveCrmOpportunityCycle([
    { ...provisional, id: 'provisional-1', cycleNumber: 1, closed: false },
  ], provisional).action, 'reuse')
})

test('provisional promotion rebases cycles, merges an active destination, and booking retries reuse history', () => {
  const provisional = { organisationId: 'org-1', contactId: 'contact-1', siteIdentity: null, id: 'provisional-1', cycleNumber: 1, closed: false }
  const closedSite = { organisationId: 'org-1', contactId: 'contact-1', siteIdentity: 'site-a', id: 'closed-site-1', cycleNumber: 1, closed: true }
  assert.deepEqual(resolveCrmProvisionalPromotion([provisional, closedSite], provisional.id, 'site-a'), {
    action: 'promote', opportunityId: provisional.id, cycleNumber: 2, previousOpportunityId: closedSite.id,
  })
  const activeSite = { ...closedSite, id: 'active-site-2', cycleNumber: 2, closed: false }
  assert.deepEqual(resolveCrmProvisionalPromotion([provisional, closedSite, activeSite], provisional.id, 'site-a'), {
    action: 'merge', opportunityId: activeSite.id, cancelledOpportunityId: provisional.id,
  })
  assert.deepEqual(resolveCrmSyncLink(null, 'booking-opportunity-1'), { action: 'reuse', opportunityId: 'booking-opportunity-1' })
  assert.deepEqual(resolveCrmSyncLink('quote-opportunity-1', 'booking-opportunity-1'), { action: 'conflict', opportunityId: null })
})

test('every signature detail shown to a client is mandatory for a sender', () => {
  assert.equal(hasCompleteCrmSignature(completeAgent), true)
  assert.deepEqual(getMissingCrmSignatureFields({ ...completeAgent, email: '', phone: '' }), ['valid work email', 'work phone'])
  assert.equal(hasCompleteCrmSignature({ ...completeAgent, jobTitle: '' }), false)

  const signature = buildCrmSignature(completeAgent)
  for (const expected of [
    'Alex Agent',
    'Regional Agent',
    '0400 123 456',
    'alex@securecleaning.com.au',
    'Secure Cleaning Aus',
    'securecleaning.com.au',
    'ABN 81 674 121 825',
  ]) assert.match(signature, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('source disclosure and template fields are deterministic and non-empty', () => {
  assert.equal(requiresNamedSourceProvider('purchased_lead', 'purchased_lead'), true)
  assert.equal(requiresNamedSourceProvider('online_quote', 'enquiry'), false)
  assert.equal(
    buildContactSourceExplanation({ sourceType: 'purchased_lead', sourceProvider: 'Example Leads' }),
    'we received your contact information from Example Leads in relation to commercial cleaning services',
  )
  assert.equal(
    buildContactSourceExplanation({ sourceType: 'online_quote' }),
    'you requested information or a quote through the Secure Cleaning Aus website',
  )
  assert.equal(
    applyCrmTemplateTokens('Hi {{first_name}} from {{business_name}}', { first_name: 'Lee', business_name: 'Acme' }),
    'Hi Lee from Acme',
  )
})

test('the centrally generated footer includes disclosure and unsubscribe link', () => {
  const footer = buildCrmFooter('we received your details from Example Leads', 'https://securecleaning.com.au/unsubscribe?token=test')
  assert.match(footer, /we received your details from Example Leads/)
  assert.match(footer, /unsubscribe here: https:\/\/securecleaning\.com\.au\/unsubscribe\?token=test/)
  assert.match(footer, /ABN 81 674 121 825/)
})

test('team account creation and editing enforce canonical signature fields', () => {
  const api = source('src/app/api/admin/staff/route.ts')
  const ui = source('src/components/admin/StaffAccessAdmin.tsx')
  const staff = source('src/lib/staffAccounts.ts')

  assert.match(api, /getMissingCrmSignatureFields/)
  assert.match(api, /Complete the email signature profile/)
  assert.match(api, /jobTitle/)
  assert.match(api, /phone/)
  assert.match(ui, /Client email signature preview/)
  assert.match(ui, /Position title/)
  assert.match(ui, /Work phone/)
  assert.match(ui, /required=\{canAccessClientCrm\(draft\.role\)\}/)
  assert.match(staff, /job_title/)
  assert.match(staff, /phone/)
})

test('CRM authorization revalidates the current active staff record', () => {
  const auth = source('src/lib/clientCrmAuth.ts')
  assert.match(auth, /getAdminSessionIdentityFromRequest/)
  assert.match(auth, /getStaffAccountProfileById/)
  assert.match(auth, /!account\?\.active/)
  assert.match(auth, /account\.role !== identity\.role/)
  assert.match(auth, /account\.role === 'agent' && !account\.availabilityAssigneeId/)
})

test('CRM sends derive sensitive addressing and fixed sections on the server', () => {
  const email = source('src/lib/clientCrmEmail.ts')
  assert.match(email, /\.select\('id, email, contact_name, unsubscribe_token'\)/)
  assert.match(email, /replyTo: actor\.email/)
  assert.match(email, /buildCrmSignature\(actor\)/)
  assert.match(email, /buildCrmFooter\(sourceExplanation, unsubscribeUrl\)/)
  assert.match(email, /List-Unsubscribe/)
  assert.match(email, /\/api\/email-preferences\/unsubscribe\?token=/)
  assert.match(email, /db\.rpc\('claim_client_crm_communication'/)
  assert.match(email, /provider_outcome_unknown/)
  assert.match(email, /const purpose = 'marketing' as const/)
  assert.match(email, /\.eq\('contact_id', contact\.id\)/)
  assert.match(email, /\.in\('status', \['sending', 'unknown'\]\)/)
  assert.match(email, /previous email has an unresolved delivery outcome/i)
  assert.match(email, /db\.rpc\('finalize_client_crm_communication'/)
  assert.match(email, /db\.rpc\('unsubscribe_client_crm_contact'/)
  assert.doesNotMatch(email, /input\.to/)
  assert.doesNotMatch(email, /input\.from/)
  assert.doesNotMatch(email, /input\.replyTo/)
  assert.doesNotMatch(email, /input\.signature/)
})

test('agent views and data queries are constrained by staff assignment', () => {
  const data = source('src/lib/clientCrmData.ts')
  const agentPage = source('src/app/availability/clients/[assigneeId]/page.tsx')
  assert.match(data, /opportunityQuery = opportunityQuery\.eq\('assigned_staff_id', actor\.id\)/)
  assert.match(data, /canActorAccessAssignedOpportunity\(actor\.role, actor\.id, current\.assigned_staff_id\)/)
  assert.match(data, /db\.rpc\('update_client_crm_opportunity'/)
  assert.match(data, /p_expected_updated_at: current\.updated_at/)
  assert.match(agentPage, /account\.availabilityAssigneeId === assigneeId/)
  assert.match(agentPage, /account\.role === 'agent'/)
})

test('manual opportunity and template creation use atomic service-role transactions', () => {
  const data = source('src/lib/clientCrmData.ts')
  assert.match(data, /db\.rpc\('create_client_crm_opportunity'/)
  assert.match(data, /db\.rpc\('save_client_crm_template'/)
  assert.doesNotMatch(data, /crm_email_template_versions'\)\.insert/)
})

test('shared templates are editable by agents with server-side version history and contact send holds are visible across sites', () => {
  const data = source('src/lib/clientCrmData.ts')
  const migration = source('supabase/client_crm_foundation_migration.sql')
  const workspace = source('src/components/admin/ClientCrmWorkspace.tsx')
  assert.match(data, /\|\| template\.visibility === 'shared'/)
  assert.match(migration, /p_actor_role = 'agent' AND current_template\.visibility = 'shared'/)
  assert.match(migration, /resolved_status := current_template\.status/)
  assert.match(data, /\.in\('contact_id', contactIds\)\.in\('status', \['sending', 'unknown'\]\)/)
  assert.match(data, /hasContactUnresolvedEmail: unresolvedContactIds\.has\(contactId\)/)
  assert.match(workspace, /selectedLead\?\.hasContactUnresolvedEmail/)
})

test('availability imports cannot activate incomplete CRM senders', () => {
  const migration = source('src/lib/staffAgentMigration.ts')
  assert.match(migration, /hasCompleteCrmSignature/)
  assert.match(migration, /active: false/)
  assert.match(migration, /active: assignee\.active && hasCompleteCrmSignature\(current\)/)
})

test('online quote and booking workflows keep one connected CRM opportunity', () => {
  const quoteRoute = source('src/app/api/quote/route.ts')
  const bookingRoute = source('src/app/api/booking/route.ts')
  const data = source('src/lib/clientCrmData.ts')
  assert.match(quoteRoute, /syncOnlineQuoteCrmOpportunity/)
  assert.match(quoteRoute, /resolvePublicSubmissionClient/)
  assert.match(quoteRoute, /quoteId: quoteData\.id/)
  assert.match(bookingRoute, /syncBookingCrmOpportunity/)
  assert.match(bookingRoute, /resolvePublicSubmissionClient/)
  assert.doesNotMatch(quoteRoute, /\.from\('clients'\)[\s\S]{0,400}\.upsert/)
  assert.doesNotMatch(bookingRoute, /\.from\('clients'\)[\s\S]{0,400}\.upsert/)
  assert.doesNotMatch(bookingRoute, /Non-critical lead insert failed/)
  assert.match(data, /db\.rpc\('sync_client_crm_opportunity'/)
  assert.doesNotMatch(data, /onConflict: 'quote_id'/)
  assert.match(bookingRoute, /bookingId: bookingData\.id/)
  assert.match(bookingRoute, /\.eq\('client_id', clientData\.id\)/)
  assert.match(quoteRoute, /clientError instanceof ClientCrmError/)
  assert.match(bookingRoute, /clientError instanceof ClientCrmError/)
  assert.match(data, /resolvePublicContactMatch/)
  assert.match(data, /db\.rpc\('find_client_crm_contacts_by_email', \{ p_email: email \}\)/)
  assert.doesNotMatch(data, /\.ilike\('email'/)
})

test('the client CRM route is not intercepted by a legacy admin redirect', () => {
  const nextConfig = source('next.config.js')
  assert.doesNotMatch(nextConfig, /source:\s*['"]\/admin\/clients['"]/)
})

test('unsubscribe confirmation does not mutate on page load and suppression is server-side', () => {
  const page = source('src/app/unsubscribe/page.tsx')
  const form = source('src/components/UnsubscribeForm.tsx')
  const route = source('src/app/api/email-preferences/unsubscribe/route.ts')
  assert.doesNotMatch(page, /unsubscribeCrmContact/)
  assert.match(form, /method: 'POST'/)
  assert.match(route, /unsubscribeCrmContact\(token\)/)
  assert.match(route, /rateLimit/)
})

test('CRM migration normalizes opportunities, preserves history, and locks new tables to the service role', () => {
  const migration = source('supabase/client_crm_foundation_migration.sql')
  for (const table of ['crm_organisations', 'crm_opportunities', 'crm_opportunity_intakes', 'crm_opportunity_quotes', 'crm_reconciliation_issues', 'crm_email_templates', 'crm_email_template_versions', 'crm_email_suppressions', 'crm_communications']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /TO service_role USING \(true\) WITH CHECK \(true\)/)
  assert.match(migration, /idx_crm_communications_provider_id/)
  assert.match(migration, /idempotency_key UUID NOT NULL UNIQUE/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS job_title TEXT/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS phone TEXT/)
  assert.match(migration, /is_system BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION create_client_crm_opportunity/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION sync_client_crm_opportunity/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION crm_promote_provisional_opportunity/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION find_client_crm_contacts_by_email/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION update_client_crm_opportunity/)
  assert.match(migration, /current_opportunity\.updated_at IS DISTINCT FROM p_expected_updated_at/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION claim_client_crm_communication/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION finalize_client_crm_communication/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION save_client_crm_template/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION unsubscribe_client_crm_contact/)
  assert.match(migration, /REVOKE ALL ON FUNCTION create_client_crm_opportunity[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION save_client_crm_template[\s\S]*TO service_role/)
  assert.match(migration, /REVOKE ALL ON FUNCTION unsubscribe_client_crm_contact\(UUID\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /DROP POLICY IF EXISTS "Anon can insert leads" ON leads/)
  assert.match(migration, /REVOKE INSERT ON TABLE leads FROM anon/)
  assert.match(migration, /idx_crm_communications_unresolved/)
  assert.match(migration, /idx_crm_opportunities_open_site/)
  assert.match(migration, /idx_crm_opportunities_open_provisional/)
  assert.match(migration, /quote_id UUID NOT NULL REFERENCES quotes\(id\) ON DELETE RESTRICT UNIQUE/)
  assert.match(migration, /lead_id UUID NOT NULL REFERENCES leads\(id\) ON DELETE RESTRICT UNIQUE/)
  assert.match(migration, /WHERE NOT EXISTS \([\s\S]*crm_opportunity_intakes/)
  assert.match(migration, /WHERE NOT EXISTS \([\s\S]*crm_opportunity_quotes/)
  assert.match(migration, /ON CONFLICT \(lead_id\) DO NOTHING/)
  assert.match(migration, /ON CONFLICT \(quote_id\) DO NOTHING/)
  assert.match(migration, /ON CONFLICT \(template_id, version\) DO NOTHING/)
  assert.match(migration, /contact_id = converted_to_client_id/)
  assert.match(migration, /HAVING COUNT\(\*\) = 1/)
  assert.match(migration, /crm_normalize_phone/)
  assert.match(migration, /crm_site_identity_key/)
  assert.match(migration, /contact details require reconciliation/)
  assert.match(migration, /booking_opportunity_id/)
  assert.match(migration, /quote and booking belong to different opportunities/)
  assert.match(migration, /crm_promote_provisional_opportunity\(resolved_opportunity_id, resolved_site_id\)/)
  assert.match(migration, /duplicate_site_identity/)
  assert.match(migration, /duplicate_normalized_email/)
  assert.match(migration, /UPDATE sites SET crm_site_key = NULL, is_active = FALSE/)
  assert.match(migration, /details->>'canonicalSiteId'/)
  assert.match(migration, /UPDATE bookings[\s\S]{0,100}SET opportunity_id = destination_id/)
  assert.match(migration, /current_template\.created_by_staff_id IS DISTINCT FROM p_actor_id/)
  assert.match(migration, /LOWER\(BTRIM\(email\)\)/)
  assert.match(migration, /LOWER\(BTRIM\(p_to_email\)\)/)
  assert.match(migration, /p_actor_role = 'agent' AND opportunity_row\.assigned_staff_id IS DISTINCT FROM p_sender_staff_id/)
  assert.match(migration, /resolved_stage IN \('won', 'lost'\)/)
  assert.doesNotMatch(migration, /resolved_stage := 'new'/)
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_normalized/)
  assert.doesNotMatch(migration, /UPDATE clients SET (business_name|contact_name|email|phone)/)
  assert.doesNotMatch(migration, /'transactional', 'shared', 'published'/)
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/)
})
