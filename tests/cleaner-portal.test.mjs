import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

process.env.ADMIN_SESSION_SECRET ||= 'cleaner-portal-test-secret-that-is-long-enough'
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key'

const { createCleanerPortalToken, verifyCleanerPortalToken } = await import('../src/lib/cleanerPortalAccess.ts')
const { sanitizeCleanerPortalPayload } = await import('../src/lib/cleanerPortalPolicy.ts')

test('cleaner portal tokens bind mode email cleaner and expiry', () => {
  const now = Date.UTC(2026, 8, 14)
  const token = createCleanerPortalToken({ mode: 'update', email: 'Cleaner@Example.com', cleanerId: 'cleaner-123' }, now, 60)
  assert.deepEqual(verifyCleanerPortalToken(token, now + 30_000), {
    mode: 'update', email: 'cleaner@example.com', cleanerId: 'cleaner-123', exp: Math.floor(now / 1000) + 60,
  })
  assert.equal(verifyCleanerPortalToken(`${token}x`, now), null)
  assert.equal(verifyCleanerPortalToken(token, now + 61_000), null)
})

test('onboarding tokens cannot carry cleaner ownership and require valid email', () => {
  const token = createCleanerPortalToken({ mode: 'onboarding', email: 'new@example.com', cleanerId: 'ignored', state: 'nsw' })
  const claims = verifyCleanerPortalToken(token)
  assert.equal(claims?.mode, 'onboarding')
  assert.equal(claims?.cleanerId, undefined)
  assert.equal(claims?.state, 'NSW')
  assert.throws(() => createCleanerPortalToken({ mode: 'update', email: 'bad', cleanerId: '' }))
})

test('cleaner portal payload locks email and omits approval and internal fields', () => {
  const payload = sanitizeCleanerPortalPayload({
    businessName: ' Clean Co ', firstName: ' Alex ', lastName: ' Smith ', email: 'attacker@example.com', state: 'vic',
    status: 'approved', complianceStatus: 'current', internalOwner: 'attacker', rating: 5, notes: 'overwrite staff notes',
    services: ['Office cleaning', 'Office cleaning'], serviceAreas: ['Melbourne', 'Richmond'], workingWithChildrenCheck: true,
  }, 'registered@example.com')
  assert.equal(payload.email, 'registered@example.com')
  assert.equal(payload.state, 'VIC')
  assert.equal(payload.contactName, 'Alex Smith')
  assert.deepEqual(payload.services, ['Office cleaning'])
  assert.equal(payload.status, undefined)
  assert.equal(payload.complianceStatus, undefined)
  assert.equal(payload.internalOwner, undefined)
  assert.equal(payload.notes, undefined)
})

test('cleaner portal rejects missing identity and invalid regions', () => {
  assert.throws(() => sanitizeCleanerPortalPayload({ businessName: '', firstName: 'A', lastName: 'B', state: 'VIC' }, 'a@example.com'))
  assert.throws(() => sanitizeCleanerPortalPayload({ businessName: 'A', firstName: 'A', lastName: 'B', state: 'invalid' }, 'a@example.com'))
})

test('portal routes retain signed ownership, regional invitations, pending approval, notices and private upload guards', async () => {
  const [portal, profileRoute, uploadRoute, requestRoute, adminRoute, agentRoute, agentPage, adminPage, claimRoute, nav] = await Promise.all([
    readFile(new URL('../src/lib/cleanerPortal.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/cleaner-portal/profile/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/cleaner-portal/documents/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/cleaner-portal/request-access/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/cleaner-access/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/availability-agent/[assigneeId]/cleaner-access/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/availability/cleaners/[assigneeId]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/admin/cleaners/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/cleaners/portal/claim/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/AdminNav.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(portal, /status: 'pending_approval'/)
  assert.match(portal, /state: claims\.state/)
  assert.match(portal, /existing\?\.profile\.state !== requiredState/)
  assert.match(portal, /item\.role === 'owner'/)
  assert.match(portal, /availability\.assignees\.filter/)
  assert.match(portal, /\/availability\/cleaners\//)
  assert.match(portal, /No active owner is configured/)
  assert.match(portal, /No active.*agent is configured/)
  assert.match(portal, /eq\('id', claims\.cleanerId\)\.eq\('email', claims\.email\)/)
  assert.doesNotMatch(portal.match(/const PORTAL_SELECT[^\n]+/)?.[0] ?? '', /notes|rating|internal_owner|compliance_status/)
  assert.match(profileRoute, /verifyCleanerPortalToken\(request\.cookies/)
  assert.match(uploadRoute, /verifyCleanerPortalToken\(request\.cookies/)
  assert.match(uploadRoute, /10 \* 1024 \* 1024/)
  assert.match(requestRoute, /genericMessage/)
  assert.match(requestRoute, /rateLimitValue/)
  assert.match(adminRoute, /authorizeCleanerAdminRequest\(request, 'mutate'\)/)
  assert.match(agentRoute, /getCleanerAgentContext\(request, params\.assigneeId\)/)
  assert.match(agentRoute, /sendCleanerPortalLink\(email, mode, \{ state: context\.state \}\)/)
  assert.match(agentPage, /CleanerAccessAdmin/)
  assert.match(adminPage, /CleanerAccessAdmin/)
  assert.match(claimRoute, /httpOnly: true/)
  assert.match(claimRoute, /sameSite: 'lax'/)
  assert.doesNotMatch(nav, /Cleaner Invitations/)
})
