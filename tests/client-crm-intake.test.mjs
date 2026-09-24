import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
const { getCrmAgentRegion } = await import('../src/lib/clientCrmAssignment.ts')
const { crmPostcodeMatchesRegion } = await import('../src/lib/clientCrmLocation.ts')
const { getAustralianLocalitySuggestions } = await import('../src/lib/australianLocalities.ts')
const { createManualCrmOpportunity, updateCrmProfile } = await import('../src/lib/clientCrmData.ts')
const assignees = [{ id: 'nsw', city: 'sydney', active: true }, { id: 'vic', city: 'melbourne', active: true }, { id: 'disabled', city: 'sydney', active: false }]
const actor = { id: 'agent-id', role: 'agent', availabilityAssigneeId: 'nsw' }
const draft = { businessName: '', firstName: 'Example', email: 'example@example.com', postcode: '2000', contactBasis: 'enquiry' }

test('region defaults require an active linked assignee, not a guessed city', () => {
  assert.equal(getCrmAgentRegion('nsw', assignees), 'sydney')
  assert.equal(getCrmAgentRegion('vic', assignees), 'melbourne')
  for (const id of [null, 'missing', 'disabled']) assert.equal(getCrmAgentRegion(id, assignees), null)
})
test('postcode checks reject known other-state entries while permitting catalogue gaps', () => {
  assert.equal(crmPostcodeMatchesRegion('2000', 'sydney'), true)
  assert.equal(crmPostcodeMatchesRegion('2000', 'melbourne'), false)
  assert.equal(crmPostcodeMatchesRegion('3000', 'sydney'), false)
  assert.equal(crmPostcodeMatchesRegion('0000', 'sydney'), true)
})
test('suburb suggestions preserve locality choice and supply real postcode/state pairs', () => {
  const sydney = getAustralianLocalitySuggestions({ query: 'Richmond', state: 'NSW', limit: 10 })
  const melbourne = getAustralianLocalitySuggestions({ query: 'Richmond', state: 'VIC', limit: 10 })
  assert.ok(sydney.some(s => s.suburb === 'Richmond' && s.postcode === '2753'))
  assert.ok(melbourne.some(s => s.suburb === 'Richmond' && s.postcode === '3121'))
  assert.ok(sydney.every(s => s.state === 'NSW'))
})
test('creation accepts absent business names, defaults NSW, preserves named business and blocks invalid regions', async () => {
  const original = global.fetch
  const writes = []
  global.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname
    let response
    if (path.endsWith('/site_content')) response = { content: JSON.stringify({ assignees, weeklySlots: [] }) }
    else if (path.endsWith('/admin_staff_accounts')) response = []
    else if (path.endsWith('/rpc/create_client_crm_opportunity')) { writes.push(JSON.parse(options.body)); response = 'created-id' }
    else throw new Error('Unexpected request: ' + path)
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    for (const businessName of ['', '   ', 'Example Business']) {
      await createManualCrmOpportunity(actor, { ...draft, businessName })
      assert.equal(writes.at(-1).p_business_name, businessName.trim())
      assert.equal(writes.at(-1).p_city, 'sydney')
      assert.equal(writes.at(-1).p_assigned_staff_id, actor.id)
    }
    const count = writes.length
    for (const input of [ { city: 'melbourne', postcode: '3000' }, { city: 'sydney', postcode: '3000' }, { city: 'invalid' }, { firstName: '' } ]) {
      await assert.rejects(createManualCrmOpportunity(actor, { ...draft, ...input }))
    }
    await assert.rejects(createManualCrmOpportunity({ ...actor, availabilityAssigneeId: null }, draft))
    assert.equal(writes.length, count)
    await assert.rejects(updateCrmProfile(actor, {}), /Provide the contact name and a valid email/)
  } finally { global.fetch = original }
})
test('optional-name migration retains the exact profile authorization, concurrency and audit checks', () => {
  const old = readFileSync(new URL('../supabase/client_crm_missing_site_profile_migration.sql', import.meta.url), 'utf8')
  const current = readFileSync(new URL('../supabase/client_crm_optional_business_name_migration.sql', import.meta.url), 'utf8').replace(/^--.*\n/gm, '')
  const expected = old.replace("  IF NULLIF(BTRIM(p_business_name), '') IS NULL\n    OR NULLIF(resolved_contact_name, '') IS NULL", "  IF NULLIF(resolved_contact_name, '') IS NULL").replaceAll('business_name = BTRIM(p_business_name)', "business_name = BTRIM(COALESCE(p_business_name, ''))")
  assert.equal(current, expected)
})

test('profile editing sends blank or named businesses and preserves stale-write and authorization errors', async () => {
  const original = global.fetch
  let failure = null
  const writes = []
  global.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname
    let result
    if (path.endsWith('/crm_opportunities')) result = { id: 'opportunity', assigned_staff_id: actor.id, primary_contact_id: 'contact', site_id: null }
    else if (path.endsWith('/rpc/find_client_crm_contacts_by_email')) result = []
    else if (path.endsWith('/rpc/update_client_crm_profile')) {
      writes.push(JSON.parse(options.body))
      if (failure) return new Response(JSON.stringify({ code: failure, message: 'fixture failure' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      result = 'opportunity'
    } else throw new Error('Unexpected request: ' + path)
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const owner = { id: 'owner', role: 'owner' }
    const input = { opportunityId: 'opportunity', firstName: 'Example', email: 'example@example.com', expectedOpportunityUpdatedAt: '2026-09-21T00:00:00Z' }
    for (const businessName of ['', '  ', 'Named Business']) {
      await updateCrmProfile(owner, { ...input, businessName })
      assert.equal(writes.at(-1).p_business_name, businessName.trim())
      assert.equal(writes.at(-1).p_expected_opportunity_updated_at, input.expectedOpportunityUpdatedAt)
    }
    await updateCrmProfile(actor, input)
    assert.equal(writes.at(-1).p_actor_id, actor.id)
    assert.equal(writes.at(-1).p_actor_role, 'agent')
    failure = '40001'
    await assert.rejects(updateCrmProfile(owner, input), error => error.status === 409)
    failure = '42501'
    await assert.rejects(updateCrmProfile(owner, input), error => error.status === 403)
  } finally { global.fetch = original }
})
