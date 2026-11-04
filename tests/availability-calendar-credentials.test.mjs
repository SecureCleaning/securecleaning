import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { mintTestSession, testAccountResponse } from './security-auth-fixture.mjs'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://calendar-fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service'
process.env.ADMIN_SESSION_SECRET = 'calendar-fixture-admin-secret-long-enough'
process.env.AVAILABILITY_AGENT_SIGNING_SECRET = 'calendar-fixture-feed-secret-long-enough'

const { POST: saveConfig } = await import('../src/app/api/admin/availability/route.ts')
const { GET: readFeed } = await import('../src/app/api/availability-agent/[assigneeId]/feed/route.ts')
const { ADMIN_SESSION_COOKIE } = await import('../src/lib/adminAuth.ts')
const auth = await import('../src/lib/availabilityAgentAuth.ts')
const { hashAvailabilityAccessCode } = await import('../src/lib/availabilityAccessCode.ts')
const credentials = await import('../src/lib/availabilityCalendarCredentials.ts')
const { getAvailabilityCalendarFeedKey: feedKey } = credentials
const availability = await import('../src/lib/availability.ts')
const { mergeAvailabilityConfig, toBrowserAvailabilityConfig } = availability
const ownerToken = await mintTestSession({ id: 'owner-fixture', username: 'owner', role: 'owner' })
const legacyHash = hashAvailabilityAccessCode('legacy-fixture-password')
const agent = (id, extra = {}) => ({ id, name: id, username: id, city: 'melbourne', active: true, ...extra })
let stored, writes, bookings
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

function fixture() {
  stored = mergeAvailabilityConfig({ settings: { maxSlotsToShow: 3 }, assignees: [agent('legacy', { accessCodeHash: legacyHash })], zones: [], weeklySlots: [], oneOffBlocks: [] })
  writes = []
  bookings = ['new-one', 'new-two'].map(id => ({
    booking_ref: `BK-${id}`, status: 'confirmed',
    inputs: { city: 'melbourne', businessName: `Client-${id}`, suburb: 'Melbourne', preferredInspectionAssigneeId: id,
      preferredStartDate: new Date().toISOString().slice(0, 10), preferredInspectionStartTime: '10:00', preferredInspectionEndTime: '10:10' },
  }))
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input)
    assert.equal(url.hostname, 'calendar-fixture.invalid', 'Tests must never contact a live service')
    const table = url.pathname.split('/').at(-1)
    if (table === 'consume_public_rate_limit') return json({ allowed: true })
    if (table === 'availability_private_config') {
      if (init.method === 'POST') {
        stored = JSON.parse(JSON.parse(init.body).content)
        writes.push(table)
        return new Response(null, { status: 201 })
      }
      return json({ content: JSON.stringify(stored) })
    }
    assert.ok(!init.method || init.method === 'GET', `Unexpected mutation: ${table}`)
    if (table === 'admin_staff_accounts') return url.searchParams.has('id') ? testAccountResponse(input) : json([])
    if (table === 'bookings') return json(bookings)
    if (table === 'owner_operators' || table === 'calendar_public_holidays') return json([])
    throw new Error(`Unexpected fixture request: ${table}`)
  }
}

async function save(assignees, draftAccessCodes = {}, token = ownerToken) {
  return saveConfig(new NextRequest('https://fixture.invalid/api/admin/availability', {
    method: 'POST', headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    body: JSON.stringify({ config: { ...toBrowserAvailabilityConfig(stored), assignees }, draftAccessCodes }),
  }))
}

async function createProfiles() {
  const response = await save([...toBrowserAvailabilityConfig(stored).assignees, agent('new-one'), agent('new-two')])
  assert.equal(response.status, 200)
  return (await response.json()).config
}

function feed(id, token) {
  return readFeed(new NextRequest(`https://fixture.invalid/api/availability-agent/${id}/feed?token=${encodeURIComponent(token ?? '')}`), {
    params: Promise.resolve({ assigneeId: id }),
  })
}

test('saving new agent profiles provisions distinct private feeds without legacy passwords', async () => {
  fixture()
  const response = await save([...toBrowserAvailabilityConfig(stored).assignees, agent('new-one', { calendarFeedKey: 'browser-chosen-key', accessCodeHash: 'browser-chosen-password' }), agent('new-two')])
  assert.equal(response.status, 200)
  const browser = (await response.json()).config
  const one = stored.assignees.find(a => a.id === 'new-one')
  const two = stored.assignees.find(a => a.id === 'new-two')
  assert.match(one.calendarFeedKey, /^[a-f0-9]{64}$/)
  assert.notEqual(one.calendarFeedKey, two.calendarFeedKey)
  assert.equal(one.accessCodeHash, '')
  assert.equal(stored.assignees[0].accessCodeHash, legacyHash)
  assert.deepEqual(stored.weeklySlots, [])
  assert.deepEqual(stored.oneOffBlocks, [])
  assert.deepEqual(writes, ['availability_private_config'])
  for (const item of browser.assignees) {
    assert.equal(item.calendarFeedKey, undefined)
    assert.equal(item.accessCodeHash, undefined)
  }
  const key = one.calendarFeedKey
  browser.assignees[1].name = 'Renamed agent'
  browser.assignees[1].calendarFeedKey = 'replacement-from-browser'
  assert.equal((await save(browser.assignees)).status, 200)
  assert.equal(stored.assignees[1].calendarFeedKey, key, 'Ordinary edits must not invalidate subscriptions')
})

test('new staff login works without legacy password and its feed contains only that agent appointments', async () => {
  fixture()
  await createProfiles()
  const staffToken = await mintTestSession({ id: 'new-staff', username: 'new-staff', role: 'agent', availability_assignee_id: 'new-one' })
  const request = new NextRequest('https://fixture.invalid', { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${staffToken}` } })
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(request, 'new-one'), true)
  assert.equal(await auth.isAuthorizedAvailabilityAgentRequest(request, 'new-two'), false)
  const one = stored.assignees.find(a => a.id === 'new-one')
  const token = auth.createAvailabilityAgentFeedToken(one.id, feedKey(one))
  assert.ok(token)
  const writeCount = writes.length
  const response = await feed(one.id, token)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /text\/calendar/)
  const text = await response.text()
  assert.match(text, /BEGIN:VCALENDAR/)
  assert.match(text, /Client-new-one/)
  assert.doesNotMatch(text, /Client-new-two/)
  assert.doesNotMatch(text, new RegExp(one.calendarFeedKey))
  assert.equal(writes.length, writeCount, 'Reading a subscription must not write records or send messages')
  assert.equal((await save(toBrowserAvailabilityConfig(stored).assignees, {}, staffToken)).status, 401)
})

test('feeds reject other agents, inactive profiles, tampered tokens and rotated keys', async () => {
  fixture()
  await createProfiles()
  const one = stored.assignees[1]
  const key = feedKey(one)
  const token = auth.createAvailabilityAgentFeedToken(one.id, key)
  assert.equal((await feed('new-two', token)).status, 401)
  assert.equal((await feed(one.id, `${token}tampered`)).status, 401)
  assert.equal((await feed(one.id, '')).status, 401)
  assert.equal((await feed('unknown', token)).status, 404)
  const sessionToken = auth.createAvailabilityAgentSessionToken(one.id, key)
  assert.equal((await feed(one.id, sessionToken)).status, 401)
  assert.equal(auth.isValidAvailabilityAgentSessionToken(token, one.id, key), false)
  one.active = false
  assert.equal(feedKey(one), undefined)
  assert.equal((await feed(one.id, token)).status, 404)
  one.active = true
  one.calendarFeedKey = 'rotated-private-key'
  assert.equal((await feed(one.id, token)).status, 401)
})

test('existing feed URLs survive profile saves and retain legacy password revocation', async () => {
  fixture()
  const token = auth.createAvailabilityAgentFeedToken('legacy', legacyHash)
  await createProfiles()
  assert.equal((await feed('legacy', token)).status, 200)
  assert.equal(feedKey(stored.assignees[0]), legacyHash)
  assert.equal((await save(toBrowserAvailabilityConfig(stored).assignees, { legacy: 'changed-fixture-password' })).status, 200)
  assert.equal((await feed('legacy', token)).status, 401)
  const replacementToken = auth.createAvailabilityAgentFeedToken('legacy', feedKey(stored.assignees[0]))
  assert.equal((await feed('legacy', replacementToken)).status, 200)
})

test('calendar page offers staff login and exposes a signed feed only after authentication', async () => {
  fixture()
  await createProfiles()
  let authenticated = false
  const Login = () => null
  const Editor = () => null
  const mocks = {
    'react/jsx-runtime': jsxRuntime,
    '@/components/availability/AssigneeAvailabilityEditor': { default: Editor },
    '@/components/availability/AvailabilityAgentLogin': { default: Login },
    '@/lib/availability': { ...availability, getAvailabilityConfig: async () => stored },
    '@/lib/availabilityAgentAuth': { ...auth, hasAvailabilityAgentSession: async () => authenticated },
    '@/lib/availabilityCalendarCredentials': credentials,
    '@/lib/availabilityCalendar': { getAgentCalendarEvents: async () => { assert.equal(authenticated, true); return [] } },
    '@/lib/siteUrl': { getSiteUrl: () => 'https://fixture.invalid' },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/app/availability/quoters/[assigneeId]/page.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { exports, require(name) { assert.ok(name in mocks, name); return mocks[name] } })
  const params = { params: Promise.resolve({ assigneeId: 'new-one' }) }
  const login = await exports.default(params)
  assert.equal(login.type, Login)
  assert.equal(login.props.lockUsername, false, 'Staff usernames need not match legacy profile usernames')
  assert.equal(login.props.redirectPath, '/availability/quoters/new-one')
  assert.doesNotMatch(JSON.stringify(login.props), /calendarFeedKey|calendarFeedUrl|accessCodeHash/)
  authenticated = true
  const editor = await exports.default(params)
  assert.equal(editor.type, Editor)
  assert.equal(editor.props.assignee.calendarFeedKey, undefined)
  assert.equal(editor.props.assignee.accessCodeHash, undefined)
  const url = new URL(editor.props.calendarFeedUrl)
  assert.equal(url.pathname, '/api/availability-agent/new-one/feed')
  assert.equal((await feed('new-one', url.searchParams.get('token'))).status, 200)
  stored.assignees[1].active = false
  assert.notEqual((await exports.default(params)).type, Editor)
})
