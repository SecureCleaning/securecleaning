import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const owner = { id: 'owner', username: 'melb.agent', displayName: 'Test Owner', email: 'owner@example.test', jobTitle: 'Owner', phone: '0400000000', role: 'owner', active: true, availabilityAssigneeId: 'melb_primary' }
const roles = ['owner', 'manager', 'staff', 'agent', 'viewer']
function fixture(accounts = [owner], authorized = true) {
  const writes = [], exports = {}
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/adminAuth': { isAuthorizedAdminRequest: async (_request, role) => authorized && role === 'owner' },
    '@/lib/staffAccounts': {
      ADMIN_ROLES: roles, listStaffAccounts: async () => accounts,
      normalizeStaffRole: value => roles.includes(value) ? value : null,
      normalizeStaffUsername: value => value?.trim().toLowerCase(),
      createStaffAccount: async value => { writes.push(value); return value },
      updateStaffAccount: async value => { writes.push(value); return value },
    },
    '@/lib/abuseProtection': { rejectCrossOriginMutation: () => null, rejectLargePayload: async () => null },
    '@/lib/availability': { getAvailabilityConfig: async () => ({ assignees: [{ id: 'melb_primary' }, { id: 'nsw' }] }) },
    '@/lib/clientCrmPolicy': { canAccessClientCrm: role => role !== 'viewer', getMissingCrmSignatureFields: value => ['displayName', 'email', 'jobTitle', 'phone'].filter(key => !value[key]) },
  }
  const code = ts.transpileModule(readFileSync('src/app/api/admin/staff/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, console, require(name) { assert.ok(name in mocks, name); return mocks[name] } })
  return { writes, call: (method, body) => exports[method]({ json: async () => body }) }
}

test('editing an owner signature preserves the linked regional profile and owner role', async () => {
  const f = fixture()
  assert.equal((await f.call('PATCH', { id: owner.id, jobTitle: 'Customer Relationship Manager' })).status, 200)
  assert.equal(f.writes[0].availabilityAssigneeId, 'melb_primary')
  assert.equal(f.writes[0].role, 'owner')
  assert.equal(f.writes[0].email, owner.email)
})

test('owners can link, clear, or omit an optional regional profile', async () => {
  for (const value of ['melb_primary', '', undefined]) {
    const f = fixture([{ ...owner, availabilityAssigneeId: null }])
    const response = await f.call('PATCH', { id: owner.id, ...(value === undefined ? {} : { availabilityAssigneeId: value }) })
    assert.equal(response.status, 200)
    assert.equal(f.writes[0].availabilityAssigneeId, value || null)
  }
})

test('creating an owner supports an optional valid link without changing the role', async () => {
  for (const link of ['', 'melb_primary']) {
    const f = fixture([])
    const response = await f.call('POST', { ...owner, username: 'new.owner', availabilityAssigneeId: link, password: 'local-test-only-password' })
    assert.equal(response.status, 201)
    assert.equal(f.writes[0].role, 'owner')
    assert.equal(f.writes[0].availabilityAssigneeId, link || null)
  }
})

test('invalid profile IDs are rejected for owners on creation and update', async () => {
  for (const method of ['POST', 'PATCH']) {
    const f = fixture()
    assert.equal((await f.call(method, { ...owner, availabilityAssigneeId: 'missing', password: 'local-test-only-password' })).status, 400)
    assert.equal(f.writes.length, 0)
  }
})

test('an active second account cannot take an already linked profile', async () => {
  const other = { ...owner, id: 'other', availabilityAssigneeId: 'nsw' }
  for (const method of ['POST', 'PATCH']) {
    const f = fixture([owner, other])
    assert.equal((await f.call(method, { ...owner, availabilityAssigneeId: 'nsw', password: 'local-test-only-password' })).status, 409)
    assert.equal(f.writes.length, 0)
  }
})

test('regional agents still require a profile and disabled duplicates may retain their link', async () => {
  const f = fixture([{ ...owner, role: 'agent' }])
  assert.equal((await f.call('PATCH', { id: owner.id, availabilityAssigneeId: '' })).status, 400)
  assert.equal(f.writes.length, 0)
  const disabled = fixture([owner, { ...owner, id: 'disabled', active: false, availabilityAssigneeId: 'nsw' }])
  assert.equal((await disabled.call('PATCH', { id: owner.id, availabilityAssigneeId: 'nsw' })).status, 200)
})

test('regional links remain owner-managed and cannot bypass signature requirements', async () => {
  for (const method of ['POST', 'PATCH']) {
    const f = fixture([owner], false)
    assert.equal((await f.call(method, { ...owner, availabilityAssigneeId: 'nsw' })).status, 403)
    assert.equal(f.writes.length, 0)
  }
  const f = fixture()
  assert.equal((await f.call('PATCH', { id: owner.id, email: '', availabilityAssigneeId: 'nsw' })).status, 400)
  assert.equal(f.writes.length, 0)
})
