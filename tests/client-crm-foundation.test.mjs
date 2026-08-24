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
  canActorAccessAssignedLead,
  getMissingCrmSignatureFields,
  hasCompleteCrmSignature,
  requiresNamedSourceProvider,
} = await import('../src/lib/clientCrmPolicy.ts')

const { buildCrmFooter, buildCrmSignature } = await import('../src/lib/clientCrmEmail.ts')

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

  assert.equal(canActorAccessAssignedLead('owner', 'owner-1', null), true)
  assert.equal(canActorAccessAssignedLead('manager', 'manager-1', 'agent-2'), true)
  assert.equal(canActorAccessAssignedLead('agent', 'agent-1', 'agent-1'), true)
  assert.equal(canActorAccessAssignedLead('agent', 'agent-1', 'agent-2'), false)
  assert.equal(canActorAccessAssignedLead('agent', 'agent-1', null), false)
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
  assert.match(email, /status: 'sending'/)
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
  assert.match(data, /leadQuery = leadQuery\.eq\('assigned_staff_id', actor\.id\)/)
  assert.match(data, /canActorAccessAssignedLead\(actor\.role, actor\.id, current\.assigned_staff_id\)/)
  assert.match(agentPage, /account\.availabilityAssigneeId === assigneeId/)
  assert.match(agentPage, /account\.role === 'agent'/)
})

test('manual lead and template creation use atomic service-role transactions', () => {
  const data = source('src/lib/clientCrmData.ts')
  assert.match(data, /db\.rpc\('create_client_crm_lead'/)
  assert.match(data, /db\.rpc\('save_client_crm_template'/)
  assert.doesNotMatch(data, /crm_email_template_versions'\)\.insert/)
})

test('availability imports cannot activate incomplete CRM senders', () => {
  const migration = source('src/lib/staffAgentMigration.ts')
  assert.match(migration, /hasCompleteCrmSignature/)
  assert.match(migration, /active: false/)
  assert.match(migration, /active: assignee\.active && hasCompleteCrmSignature\(current\)/)
})

test('online quote and booking workflows keep one connected CRM lead', () => {
  const quoteRoute = source('src/app/api/quote/route.ts')
  const bookingRoute = source('src/app/api/booking/route.ts')
  const data = source('src/lib/clientCrmData.ts')
  assert.match(quoteRoute, /upsertOnlineQuoteCrmLead/)
  assert.match(quoteRoute, /resolvePublicSubmissionClient/)
  assert.match(quoteRoute, /quoteId: quoteData\.id/)
  assert.match(bookingRoute, /syncBookingCrmLead/)
  assert.match(bookingRoute, /resolvePublicSubmissionClient/)
  assert.doesNotMatch(quoteRoute, /\.from\('clients'\)[\s\S]{0,400}\.upsert/)
  assert.doesNotMatch(bookingRoute, /\.from\('clients'\)[\s\S]{0,400}\.upsert/)
  assert.doesNotMatch(bookingRoute, /Non-critical lead insert failed/)
  assert.match(data, /\.eq\('quote_id', input\.quoteId\)/)
  assert.match(data, /onConflict: 'quote_id'/)
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

test('CRM migration is additive and locks new tables to the service role', () => {
  const migration = source('supabase/client_crm_foundation_migration.sql')
  for (const table of ['crm_organisations', 'crm_email_templates', 'crm_email_template_versions', 'crm_email_suppressions', 'crm_communications']) {
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
  assert.match(migration, /CREATE OR REPLACE FUNCTION create_client_crm_lead/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION finalize_client_crm_communication/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION save_client_crm_template/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION unsubscribe_client_crm_contact/)
  assert.match(migration, /REVOKE ALL ON FUNCTION create_client_crm_lead[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION save_client_crm_template[\s\S]*TO service_role/)
  assert.match(migration, /REVOKE ALL ON FUNCTION unsubscribe_client_crm_contact\(UUID\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /DROP POLICY IF EXISTS "Anon can insert leads" ON leads/)
  assert.match(migration, /REVOKE INSERT ON TABLE leads FROM anon/)
  assert.match(migration, /idx_crm_communications_unresolved/)
  assert.match(migration, /contact details require reconciliation/)
  assert.doesNotMatch(migration, /'transactional', 'shared', 'published'/)
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/)
})
