import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const {
  buildCleanerScopeSnapshot,
  calculateContractProductPricing,
  canActorAccessContractProduct,
  canTransitionContractProduct,
  containsForbiddenCleanerScopeData,
  getContractProductStateForCity,
  getDefaultAnnualVisits,
  isPublishableCleanerScope,
} = await import('../src/lib/contractProductPolicy.ts')
const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG } = await import('../src/lib/roomTypeConfig.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

function finalDocument() {
  return {
    variant: 'final', version: 2, reviewedAt: '2026-08-28T00:00:00.000Z',
    reviewedBy: { kind: 'staff_account', id: 'staff-1', name: 'Agent One' },
    inputs: {
      city: 'melbourne', suburb: 'Richmond', postcode: '3121', address: '10 Private Street',
      businessName: 'Private Client Pty Ltd', contactName: 'Pat Person', email: 'pat@example.com',
      phone: '0400000000', premisesType: 'office', floorArea: 120, floors: 1,
      frequency: 'weekly', timePreference: 'after_hours', preferredStartDate: '2026-09-10',
      addOns: { glassCleaningRequired: false, highTouchDisinfection: true, carpetSteam: false, consumables: false },
    },
    result: { estimatedHours: 3 },
    firmQuoteDraft: {
      status: 'reviewed', revisedInputs: {}, moppingMinutesPerSqm: 0.25, pricingAdjustmentPercent: 0,
      targetPrice: '', finalPerVisit: '', scopeSummary: 'private free text', inclusions: '', exclusions: '', serviceCommentary: '',
      roomItems: [{ id: 'room-1', type: 'office', label: 'Client-specific room name', description: 'private note', quantity: 2, size: 60, floor: 1 }],
    },
    pricingPreview: {}, displayPrice: { low: 200, high: 200, isFirm: true },
    roomTypeConfig: DEFAULT_QUOTE_ROOM_TYPE_CONFIG,
  }
}

test('contract product financial defaults use expected annual visits and editable 50 percent purchase price', () => {
  assert.equal(getDefaultAnnualVisits('daily'), 260)
  assert.equal(getDefaultAnnualVisits('3x_week'), 156)
  assert.equal(getDefaultAnnualVisits('2x_week'), 104)
  assert.equal(getDefaultAnnualVisits('weekly'), 52)
  assert.equal(getDefaultAnnualVisits('fortnightly'), 26)
  assert.equal(getDefaultAnnualVisits('once_off'), 1)
  assert.deepEqual(calculateContractProductPricing(20_000, 52), {
    annualValueExGstCents: 1_040_000,
    suggestedPurchasePriceExGstCents: 520_000,
    gstRate: 0.1,
  })
})

test('cleaner scope is a privacy-safe immutable projection of the reviewed final quote', () => {
  const scope = buildCleanerScopeSnapshot(finalDocument())
  assert.equal(scope.state, 'VIC')
  assert.equal(scope.suburb, 'Richmond')
  assert.equal(scope.rooms[0].label, 'Office area')
  assert.ok(scope.rooms[0].tasks.length > 0)
  assert.deepEqual(scope.selectedOptions, ['High-touch disinfection'])
  assert.equal(isPublishableCleanerScope(scope), true)
  const serialized = JSON.stringify(scope)
  for (const privateValue of ['Private Client', 'Private Street', 'pat@example.com', '0400000000', 'private free text', 'private note']) {
    assert.doesNotMatch(serialized, new RegExp(privateValue, 'i'))
  }
  assert.equal(containsForbiddenCleanerScopeData({ nested: { email: 'test@example.com' } }), true)
  assert.equal(isPublishableCleanerScope({ ...scope, contactName: 'Pat Person' }), false)
})

test('product access and lifecycle keep agents within their assigned records', () => {
  assert.equal(canActorAccessContractProduct('owner', 'owner', null), true)
  assert.equal(canActorAccessContractProduct('manager', 'manager', 'agent-1'), true)
  assert.equal(canActorAccessContractProduct('agent', 'agent-1', 'agent-1'), true)
  assert.equal(canActorAccessContractProduct('agent', 'agent-1', 'agent-2'), false)
  assert.equal(canTransitionContractProduct('draft', 'available'), true)
  assert.equal(canTransitionContractProduct('available', 'sold'), false)
  assert.equal(canTransitionContractProduct('reserved', 'sold'), true)
  assert.equal(canTransitionContractProduct('sold', 'available'), false)
  assert.equal(getContractProductStateForCity('Sydney'), 'NSW')
  assert.equal(getContractProductStateForCity('Adelaide'), null)
})

test('won transition is atomic, evidence-based, idempotent, and cannot be bypassed by the generic CRM update', () => {
  const migration = source('supabase/contract_products_migration.sql')
  const crmData = source('src/lib/clientCrmData.ts')
  const products = source('src/lib/contractProducts.ts')
  assert.match(migration, /CREATE OR REPLACE FUNCTION close_crm_opportunity_won_and_create_product/)
  assert.match(migration, /WHERE opportunity_id = p_opportunity_id;\s+IF existing_product_id IS NOT NULL THEN RETURN existing_product_id;/s)
  assert.match(migration, /crm_opportunity_quotes[\s\S]+quote_id = p_quote_id/)
  assert.match(migration, /final_quote_document IS NULL/)
  assert.match(migration, /acceptance evidence is incomplete/)
  assert.match(migration, /CREATE TRIGGER trg_crm_won_product_link BEFORE UPDATE ON crm_opportunities/)
  assert.match(crmData, /Use Close as won so the winning final quote and contract product are created together/)
  assert.match(products, /cleanerScopeSnapshot\.state !== actor\.productState/)
  assert.match(products, /\.eq\('assigned_staff_id', actor\.id\)\.eq\('state', actor\.productState\)/)
  assert.match(migration, /p_actor_role = 'agent' AND source_state IS DISTINCT FROM p_actor_state/)
})

test('agent quote workbench exposes the protected won transition and existing product handoff', () => {
  const page = source('src/app/availability/quotes/[assigneeId]/[ref]/page.tsx')
  const action = source('src/components/availability/AgentQuoteWinAction.tsx')
  const access = source('src/lib/clientCrmQuoteAccess.ts')
  assert.match(page, /getCrmAssignedQuoteOpportunityContext\(assigneeId, quote\.id\)/)
  assert.match(page, /<AgentQuoteWinAction/)
  assert.doesNotMatch(page, /hasFinalDocument=/)
  assert.match(action, /Mark quote as won/)
  assert.match(action, /latest saved quote version/)
  assert.match(action, /action: 'opportunity\.close-won'/)
  assert.match(action, /opportunityId: opportunity\.id/)
  assert.match(action, /quoteId,/)
  assert.match(action, /expectedUpdatedAt: opportunity\.updatedAt/)
  assert.match(action, /acceptanceDate,/)
  assert.match(action, /acceptanceMethod,/)
  assert.match(action, /acceptanceNote: acceptanceNote\.trim\(\)/)
  assert.doesNotMatch(action, /!hasFinalDocument/)
  assert.match(action, /Open contract product/)
  assert.match(access, /\.eq\('availability_assignee_id', assigneeId\)[\s\S]+\.eq\('role', 'agent'\)[\s\S]+\.eq\('active', true\)/)
  assert.match(access, /\.from\('contract_products'\)[\s\S]+\.eq\('opportunity_id', opportunityId\)/)
})

test('won transition accepts the latest saved quote snapshot without weakening authorization or atomicity', () => {
  const migration = source('supabase/contract_product_saved_quote_won_migration.sql')
  const products = source('src/lib/contractProducts.ts')
  const workspace = source('src/components/admin/ClientCrmWorkspace.tsx')
  assert.match(products, /final_quote_document, final_quote_document_version|final_quote_document/)
  assert.match(products, /parseFirmQuoteDraft\(quote\.firm_quote_workflow/)
  assert.match(products, /buildFirmQuotePreview\(firmQuoteDraft/)
  assert.match(products, /sourcePricing:[\s\S]+clientPricePerVisitExGstCents/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION close_crm_opportunity_won_and_create_product/)
  assert.match(migration, /source_kind := 'final'/)
  assert.match(migration, /source_kind := 'saved_workflow'/)
  assert.match(migration, /source_kind := 'original'/)
  assert.match(migration, /quote is not linked to opportunity/)
  assert.match(migration, /opportunity not assigned to agent/)
  assert.match(migration, /cleaner scope does not match saved quote/)
  assert.match(migration, /p_cleaner_scope_snapshot - 'sourcePricing'/)
  assert.match(migration, /WHERE opportunity_id = p_opportunity_id;\s+IF existing_product_id IS NOT NULL THEN RETURN existing_product_id;/s)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = public, pg_temp/)
  assert.match(migration, /REVOKE ALL ON FUNCTION close_crm_opportunity_won_and_create_product[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION close_crm_opportunity_won_and_create_product[\s\S]+TO service_role/)
  assert.match(workspace, /Winning saved quote/)
  assert.match(workspace, /selectedLead\.quotes\.map/)
  assert.doesNotMatch(workspace, /selectedLead\.quotes\.filter\(\(quote\) => quote\.hasFinalDocument\)/)
})

test('migration is rerunnable and new product data remains service-role only', () => {
  const migration = source('supabase/contract_products_migration.sql')
  for (const pattern of [
    /CREATE SEQUENCE IF NOT EXISTS contract_product_code_seq/,
    /ADD COLUMN IF NOT EXISTS winning_quote_id/,
    /CREATE TABLE IF NOT EXISTS contract_products/,
    /CREATE TABLE IF NOT EXISTS contract_product_versions/,
    /ON CONFLICT \(id\) DO NOTHING/,
    /CREATE OR REPLACE FUNCTION publish_contract_product/,
    /IF NOT EXISTS \(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contract_products_updated_at'\)/,
  ]) assert.match(migration, pattern)
  assert.match(migration, /ALTER TABLE contract_products ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE contract_products[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT ALL ON TABLE contract_products[\s\S]+TO service_role/)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = public/g)
  assert.match(migration, /REVOKE ALL ON FUNCTION close_crm_opportunity_won_and_create_product[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION close_crm_opportunity_won_and_create_product[\s\S]+TO service_role/)
})

test('cleaner directory uses a signed token bootstrap, no indexing, server-side allowlist, and generic interest response', () => {
  const access = source('src/lib/cleanerJobsAccess.ts')
  const accessRoute = source('src/app/jobs/access/[token]/route.ts')
  const interestRoute = source('src/app/api/jobs/interest/route.ts')
  const products = source('src/lib/contractProducts.ts')
  const robots = source('src/app/robots.ts')
  assert.match(access, /createHmac\('sha256'/)
  assert.match(access, /timingSafeEqual/)
  assert.match(accessRoute, /httpOnly: true/)
  assert.match(accessRoute, /path: '\/'/)
  assert.match(accessRoute, /X-Robots-Tag.*noindex, nofollow, noarchive/)
  assert.match(robots, /'\/jobs\/'/)
  assert.match(products, /export type CleanerJobListing = Pick<ContractProduct/)
  assert.doesNotMatch(products.match(/export type CleanerJobListing[\s\S]+?\n>/)?.[0] ?? '', /sourceQuoteRef|opportunityId|clientPricePerVisit/)
  assert.match(products, /assertCleanerListingExcludesSourcePii/)
  assert.match(products, /Remove client identity, exact address, postcode, email, or phone details before publishing/)
  assert.match(interestRoute, /status: 202/)
  assert.equal((interestRoute.match(/If your approved cleaner details match/g) ?? []).length, 2)
  assert.match(products, /accessLink\.state && accessLink\.state !== product\.state/)
  assert.match(products, /\.eq\('email', email\)\.eq\('status', 'approved'\)/)
  assert.doesNotMatch(products, /\.ilike\('email', email\)/)
  assert.match(source('supabase/contract_products_migration.sql'), /verification_status TEXT NOT NULL DEFAULT 'unverified'/)
})

test('broadcasts are state-scoped, suppressed, idempotent, individually addressed, and unsubscribable', () => {
  const broadcasts = source('src/lib/contractProductBroadcasts.ts')
  const migration = source('supabase/contract_products_migration.sql')
  const unsubscribe = source('src/app/api/cleaner-email-preferences/unsubscribe/route.ts')
  assert.match(broadcasts, /actor\.role === 'agent' && actor\.productState !== state/)
  assert.match(broadcasts, /crm_email_suppressions/)
  assert.match(broadcasts, /idempotency_key: idempotencyKey/)
  const workspace = source('src/components/admin/ContractProductsWorkspace.tsx')
  assert.match(workspace, /broadcastRequestId \|\| crypto\.randomUUID\(\)/)
  assert.match(workspace, /if \(result\.inProgress\)[\s\S]+return[\s\S]+setBroadcastRequestId\(''\)/)
  assert.match(broadcasts, /to: cleaner\.email/)
  assert.match(broadcasts, /recipients\.eligible\.length > 50/)
  assert.match(broadcasts, /List-Unsubscribe-Post/)
  assert.match(broadcasts, /rpc\('claim_cleaner_broadcast_recipient'/)
  assert.match(broadcasts, /rpc\('claim_cleaner_broadcast_campaign'/)
  assert.match(broadcasts, /\.eq\('runner_token', runnerToken\)/)
  assert.match(broadcasts, /existingCampaign[\s\S]+cleaner_broadcast_campaign_products/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION unsubscribe_cleaner_broadcast/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_recipient/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_campaign/)
  assert.match(migration, /runner_token UUID/)
  assert.match(migration, /c\.status = 'approved'[\s\S]+crm_email_suppressions[\s\S]+p\.status <> 'available'/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cleaner_broadcast_suppressions/)
  assert.match(migration, /INSERT INTO cleaner_broadcast_suppressions/)
  assert.match(migration, /crm_email_suppressions s[\s\S]+s\.blocks_all = TRUE/)
  assert.doesNotMatch(migration, /INSERT INTO crm_email_suppressions\(email_normalized, reason, blocks_all, source\)/)
  assert.match(unsubscribe, /unsubscribeCleanerBroadcast/)
})
