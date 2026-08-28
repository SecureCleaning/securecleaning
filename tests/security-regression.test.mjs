import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NextRequest } from 'next/server'

process.env.CONTENT_ADMIN_PASSWORD = 'test-admin-password'
process.env.ADMIN_SESSION_SECRET = 'test-session-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const {
  createAdminSessionToken,
  ADMIN_SESSION_COOKIE,
  isAuthorizedAdminRequest,
  isValidAdminPassword,
  isValidAdminSessionToken,
} = await import('../src/lib/adminAuth.ts')
const {
  hashStaffPassword,
  normalizeStaffRole,
  normalizeStaffUsername,
  verifyStaffPassword,
} = await import('../src/lib/staffAccounts.ts')
const {
  rejectCrossOriginMutation,
  rejectLargePayload,
  validatePublicSubmission,
} = await import('../src/lib/abuseProtection.ts')
const {
  createAvailabilityAgentFeedToken,
  createAvailabilityAgentSessionToken,
  isValidAvailabilityAgentFeedToken,
  isValidAvailabilityAgentSessionToken,
} = await import('../src/lib/availabilityAgentAuth.ts')
const {
  hashAvailabilityAccessCode,
  verifyAvailabilityAccessCode,
} = await import('../src/lib/availabilityAccessCode.ts')
const {
  findMatchingZones,
  getInspectionAppointmentWindows,
  locationMatchesServiceZones,
} = await import('../src/lib/availability.ts')

test('availability access codes verify only against their exact hash', () => {
  const hash = hashAvailabilityAccessCode('  NSW-Agent-Secret  ')

  assert.equal(verifyAvailabilityAccessCode('NSW-Agent-Secret', hash), true)
  assert.equal(verifyAvailabilityAccessCode('wrong-secret', hash), false)
  assert.equal(verifyAvailabilityAccessCode('', hash), false)
})

test('admin sessions are signed and reject tampering', () => {
  assert.equal(isValidAdminPassword('test-admin-password'), true)
  assert.equal(isValidAdminPassword('wrong-password'), false)

  const token = createAdminSessionToken({ id: 'owner-id', username: 'owner', role: 'owner' })
  assert.ok(token)
  assert.equal(isValidAdminSessionToken(token), true)
  assert.equal(isValidAdminSessionToken(`${token}tampered`), false)
  assert.equal(isValidAdminSessionToken(null), false)
})

test('admin API authorization requires the signed session cookie', () => {
  const headerOnlyRequest = new NextRequest('https://securecleaning.com.au/api/admin/reporting', {
    headers: { 'x-admin-password': 'test-admin-password' },
  })
  assert.equal(isAuthorizedAdminRequest(headerOnlyRequest), false)

  const sessionToken = createAdminSessionToken({ id: 'staff-id', username: 'staff.one', role: 'staff' })
  const sessionRequest = new NextRequest('https://securecleaning.com.au/api/admin/reporting', {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${sessionToken}` },
  })
  assert.equal(isAuthorizedAdminRequest(sessionRequest), true)
  assert.equal(isAuthorizedAdminRequest(sessionRequest, 'owner'), false)
  assert.equal(isAuthorizedAdminRequest(sessionRequest, 'viewer'), true)

  const agentToken = createAdminSessionToken({ id: 'agent-id', username: 'regional.agent', role: 'agent' })
  const agentRequest = new NextRequest('https://securecleaning.com.au/api/admin/reporting', {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${agentToken}` },
  })
  assert.equal(isAuthorizedAdminRequest(agentRequest), false)
  assert.equal(isAuthorizedAdminRequest(agentRequest, 'agent'), true)
})

test('staff passwords are salted, hashed, and roles are constrained', () => {
  const hash = hashStaffPassword('a-long-staff-password')
  assert.notEqual(hash, 'a-long-staff-password')
  assert.equal(verifyStaffPassword('a-long-staff-password', hash), true)
  assert.equal(verifyStaffPassword('wrong-password', hash), false)
  assert.equal(normalizeStaffUsername('  Jane Smith! '), 'janesmith')
  assert.equal(normalizeStaffRole('manager'), 'manager')
  assert.equal(normalizeStaffRole('agent'), 'agent')
  assert.equal(normalizeStaffRole('administrator'), null)
})

function findRouteFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findRouteFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

test('protected admin and agent API routes retain server-side guards', () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const adminRoutes = findRouteFiles(join(projectRoot, 'src/app/api/admin'))
    .filter((path) => !path.endsWith('/session/route.ts'))
  const agentRoutes = findRouteFiles(join(projectRoot, 'src/app/api/availability-agent'))
    .filter((path) => !path.endsWith('/session/route.ts'))

  assert.ok(adminRoutes.length > 0)
  assert.ok(agentRoutes.length > 0)

  for (const path of adminRoutes) {
    assert.match(readFileSync(path, 'utf8'), /isAuthorizedAdminRequest|authorizeCleanerAdminRequest|getClientCrmActor|getContractProductActor/)
  }

  for (const path of agentRoutes) {
    assert.match(
      readFileSync(path, 'utf8'),
      /isAuthorizedAdminRequest|isAuthorizedAvailabilityAgentRequest|isValidAvailabilityAgentFeedToken|getCleanerAgentContext/,
    )
  }
})

test('agent sessions are bound to the agent and access-code hash', () => {
  const accessCodeHash = hashAvailabilityAccessCode('nsw-secret')
  const token = createAvailabilityAgentSessionToken('nsw-agent', accessCodeHash)
  const feedToken = createAvailabilityAgentFeedToken('nsw-agent', accessCodeHash)

  assert.ok(token)
  assert.ok(feedToken)
  assert.equal(isValidAvailabilityAgentSessionToken(token, 'nsw-agent', accessCodeHash), true)
  assert.equal(isValidAvailabilityAgentSessionToken(token, 'other-agent', accessCodeHash), false)
  assert.equal(isValidAvailabilityAgentSessionToken(token, 'nsw-agent', hashAvailabilityAccessCode('other-secret')), false)
  assert.equal(isValidAvailabilityAgentSessionToken(`${token}tampered`, 'nsw-agent', accessCodeHash), false)

  assert.equal(isValidAvailabilityAgentFeedToken(feedToken, 'nsw-agent', accessCodeHash), true)
  assert.equal(isValidAvailabilityAgentFeedToken(token, 'nsw-agent', accessCodeHash), false)
  assert.equal(isValidAvailabilityAgentFeedToken(feedToken, 'other-agent', accessCodeHash), false)
})

test('regional zone matching accepts suburb or postcode but rejects another city', () => {
  const zones = [
    {
      id: 'randwick',
      name: 'Randwick City Council',
      city: 'sydney',
      matchTerms: ['Randwick'],
      postcodes: ['2031'],
    },
  ]

  assert.equal(findMatchingZones('Randwick', 'sydney', { zones }).length, 1)
  assert.equal(locationMatchesServiceZones({ suburb: 'Randwick' }, 'sydney', zones), true)
  assert.equal(locationMatchesServiceZones({ postcode: '2031' }, 'sydney', zones), true)
  assert.equal(locationMatchesServiceZones({ suburb: 'Randwick' }, 'melbourne', zones), false)
  assert.equal(locationMatchesServiceZones({ suburb: 'Newtown' }, 'sydney', zones), false)
})

test('inspection availability includes the published end time as a valid start', () => {
  assert.deepEqual(getInspectionAppointmentWindows('10:00', '15:00'), [
    { startTime: '10:00', endTime: '10:10' },
    { startTime: '11:00', endTime: '11:10' },
    { startTime: '12:00', endTime: '12:10' },
    { startTime: '13:00', endTime: '13:10' },
    { startTime: '14:00', endTime: '14:10' },
    { startTime: '15:00', endTime: '15:10' },
  ])
})

test('public submissions reject honeypots and missing acceptable-use consent', async () => {
  const honeypotResponse = validatePublicSubmission({ website: 'https://bot.example' })
  assert.equal(honeypotResponse?.status, 400)
  assert.deepEqual(await honeypotResponse.json(), {
    success: false,
    error: 'Submission rejected.',
  })

  const consentResponse = validatePublicSubmission({}, { requireAcceptableUse: true })
  assert.equal(consentResponse?.status, 400)
  assert.match((await consentResponse.json()).error, /genuine authorised enquiry/)
})

test('public submissions reject stale or automated form timings', () => {
  const response = validatePublicSubmission(
    { formStartedAt: Date.now() - 1_000 },
    { minElapsedMs: 5_000 }
  )

  assert.equal(response?.status, 400)
})

test('mutation protection rejects cross-origin requests and oversized bodies', async () => {
  const crossOriginRequest = new NextRequest('https://securecleaning.com.au/api/quote', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
  })
  const originResponse = rejectCrossOriginMutation(crossOriginRequest)
  assert.equal(originResponse?.status, 403)

  const largeRequest = new NextRequest('https://securecleaning.com.au/api/quote', {
    method: 'POST',
    headers: { 'content-length': '1001' },
  })
  const payloadResponse = rejectLargePayload(largeRequest, 1000)
  assert.equal(payloadResponse?.status, 413)
  assert.match((await payloadResponse.json()).error, /too large/)
})
