import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { mintTestSession, testAccountResponse } from './security-auth-fixture.mjs'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ADMIN_SESSION_SECRET = 'test-agent-policy-secret-long-enough'
process.env.AVAILABILITY_AGENT_SIGNING_SECRET = 'test-agent-signing-secret-long-enough'
const auth = await import('../src/lib/availabilityAgentAuth.ts')
const { hashAvailabilityAccessCode } = await import('../src/lib/availabilityAccessCode.ts')
const { DELETE, PATCH } = await import('../src/app/api/availability-agent/[assigneeId]/bookings/[bookingRef]/route.ts')
const { saveCleanerPortalProfile } = await import('../src/lib/cleanerPortal.ts')
const { ADMIN_SESSION_COOKIE } = await import('../src/lib/adminAuth.ts')
const agent = { id: 'agent-melbourne', name: 'Agent', username: 'agent', city: 'melbourne', active: true, accessCodeHash: hashAvailabilityAccessCode('secret-code') }
let booking, mutations, audits, cleaner
function json(value) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }) }
function fixture() {
  mutations = []; audits = []
  booking = { booking_ref: 'B1', status: 'confirmed', inspection_status: 'scheduled', inspection_scheduled_for: '2098-01-01T00:00:00Z', assigned_operator_id: null, inputs: { city: 'melbourne', preferredInspectionAssigneeId: agent.id, preferredStartDate: '2098-01-01', preferredInspectionStartTime: '10:00', preferredInspectionEndTime: '10:10', preferredInspectionDay: 'monday', preferredInspectionSlotLabel: 'Monday 10:00', customerNote: 'retain' } }
  cleaner = { id: 'c1', email: 'cleaner@example.com', state: 'VIC', status: 'approved', business_name: 'Clean', first_name: 'A', last_name: 'B' }
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(input)
    if (u.pathname.endsWith('/availability_private_config')) return json({ content: JSON.stringify({ assignees: [agent], zones: [], weeklySlots: [], oneOffBlocks: [] }) })
    if (u.pathname.endsWith('/admin_staff_accounts')) return testAccountResponse(input)
    if (u.pathname.endsWith('/admin_audit_log')) { audits.push(JSON.parse(init.body)); return new Response(null, { status: 201 }) }
    if (u.pathname.endsWith('/bookings')) {
      if (init.method === 'PATCH') { const update = JSON.parse(init.body); mutations.push(update); booking = { ...booking, ...update }; return json(booking) }
      return json(u.searchParams.has('limit') ? [] : booking)
    }
    if (u.pathname.endsWith('/cleaners')) {
      if (init.method === 'PATCH') { const update = JSON.parse(init.body); mutations.push(update); cleaner = { ...cleaner, ...update }; return json(cleaner) }
      return json(u.searchParams.get('id') === `eq.${cleaner.id}` && u.searchParams.get('email') === `eq.${cleaner.email}` ? cleaner : null)
    }
    throw new Error(`Unexpected fixture request: ${u.pathname}`)
  }
}
function req(method = 'DELETE', body, headers = {}) {
  const token = auth.createAvailabilityAgentSessionToken(agent.id, agent.accessCodeHash)
  return new NextRequest('https://example.test/api/availability-agent/agent-melbourne/bookings/B1', { method, headers: { cookie: `${auth.AVAILABILITY_AGENT_SESSION_COOKIE}=${token}`, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
const props = { params: Promise.resolve({ assigneeId: agent.id, bookingRef: 'B1' }) }
test('raw codes cannot authorize APIs; signed session remains assignee-bound', async () => {
  fixture()
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(new NextRequest('https://example.test', { headers: { 'x-availability-access-code': 'secret-code' } }), agent.id), false)
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(req(), agent.id), true)
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(req(), 'different-agent'), false)
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(req('DELETE', null, { cookie: `${auth.AVAILABILITY_AGENT_SESSION_COOKIE}=invalid` }), agent.id), false)
})
test('linked active staff sessions retain access only to their assignee', async () => {
  const token = await mintTestSession({ id: 'staff1', username: 'agent', role: 'agent', availability_assignee_id: agent.id })
  fixture()
  const request = req('DELETE', null, { cookie: `${ADMIN_SESSION_COOKIE}=${token}` })
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(request, agent.id), true)
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(request, 'other'), false)
})
test('inspection cancellation clears schedule and preserves booking and assignment', async () => {
  fixture()
  const response = await DELETE(req(), props)
  assert.equal(response.status, 200)
  assert.equal(booking.status, 'confirmed')
  assert.equal(booking.inspection_status, 'cancelled')
  assert.equal(booking.inspection_scheduled_for, null)
  assert.deepEqual(booking.inputs, { city: 'melbourne', preferredInspectionAssigneeId: agent.id, customerNote: 'retain' })
  assert.equal(audits[0].action, 'agent_inspection_cancelled')
})
test('authorized agents can reopen completed inspections without manager approval', async () => {
  fixture(); booking.inspection_status = 'completed'
  const response = await PATCH(req('PATCH', { preferredStartDate: '2098-01-02', preferredInspectionStartTime: '10:00' }), props)
  assert.equal(response.status, 200)
  assert.equal(booking.inspection_status, 'scheduled')
  assert.equal(booking.status, 'confirmed')
})
test('reopening and cancellation reject unrelated assignment without writes', async () => {
  fixture(); booking.inputs.preferredInspectionAssigneeId = 'other-agent'
  assert.equal((await PATCH(req('PATCH', { preferredStartDate: '2098-01-02', preferredInspectionStartTime: '10:00' }), props)).status, 404)
  assert.equal((await DELETE(req(), props)).status, 404)
  assert.deepEqual(mutations, [])
})
test('approved cleaners can move interstate without changing approval or internal fields', async () => {
  fixture()
  const result = await saveCleanerPortalProfile({ mode: 'update', cleanerId: 'c1', email: cleaner.email }, { businessName: 'Clean', firstName: 'A', lastName: 'B', state: 'NSW', email: 'other@example.com', status: 'pending_approval', notes: 'tamper', complianceStatus: 'current' })
  assert.equal(result.profile.state, 'NSW')
  assert.equal(result.profile.status, 'approved')
  assert.equal(result.profile.email, 'cleaner@example.com')
  for (const key of ['status', 'notes', 'compliance_status']) assert.equal(Object.hasOwn(mutations[0], key), false)
})
test('cleaner updates reject mismatched email or record ownership and invalid states', async () => {
  for (const claims of [{ mode: 'update', cleanerId: 'c2', email: 'cleaner@example.com' }, { mode: 'update', cleanerId: 'c1', email: 'other@example.com' }]) {
    fixture()
    await assert.rejects(saveCleanerPortalProfile(claims, { businessName: 'Clean', firstName: 'A', lastName: 'B', state: 'NSW' }), /access is no longer valid/)
    assert.deepEqual(mutations, [])
  }
  fixture()
  await assert.rejects(saveCleanerPortalProfile({ mode: 'update', cleanerId: 'c1', email: cleaner.email }, { businessName: 'Clean', firstName: 'A', lastName: 'B', state: 'invalid' }), /valid state/)
  assert.deepEqual(mutations, [])
})
