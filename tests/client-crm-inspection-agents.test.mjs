import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const {
  isInspectionStaffAccount,
  resolveDefaultInspectionStaffId,
} = await import('../src/lib/clientCrmPolicy.ts')
const projectRoot = fileURLToPath(new URL('..', import.meta.url))

function account(role, overrides = {}) {
  return {
    active: true,
    role,
    availabilityAssigneeId: 'melb_primary',
    ...overrides,
  }
}

test('active calendar-linked CRM roles can conduct inspections', () => {
  assert.equal(isInspectionStaffAccount(account('owner')), true)
  assert.equal(isInspectionStaffAccount(account('manager')), true)
  assert.equal(isInspectionStaffAccount(account('agent')), true)
})

test('non-CRM, inactive, and unlinked accounts cannot conduct inspections', () => {
  assert.equal(isInspectionStaffAccount(account('staff')), false)
  assert.equal(isInspectionStaffAccount(account('viewer')), false)
  assert.equal(isInspectionStaffAccount(account('owner', { active: false })), false)
  assert.equal(isInspectionStaffAccount(account('owner', { availabilityAssigneeId: null })), false)
  assert.equal(isInspectionStaffAccount(account('owner', { availabilityAssigneeId: '   ' })), false)
})

test('inspection selection keeps an eligible assignment then defaults to the signed-in linked account', () => {
  const allowed = ['lyle-owner', 'renata-agent']
  assert.equal(resolveDefaultInspectionStaffId('lyle-owner', 'renata-agent', allowed), 'renata-agent')
  assert.equal(resolveDefaultInspectionStaffId('lyle-owner', null, allowed), 'lyle-owner')
  assert.equal(resolveDefaultInspectionStaffId('unlinked-owner', null, allowed), '')
  assert.equal(resolveDefaultInspectionStaffId('lyle-owner', 'inactive-agent', allowed), 'lyle-owner')
})

test('CRM listing, automatic assignment, booking sync, UI defaults, and appointment validation share the eligibility rule', () => {
  const data = readFileSync(`${projectRoot}/src/lib/clientCrmData.ts`, 'utf8')
  const appointments = readFileSync(`${projectRoot}/src/lib/clientCrmAppointments.ts`, 'utf8')
  const workspace = readFileSync(`${projectRoot}/src/components/admin/ClientCrmWorkspace.tsx`, 'utf8')

  assert.match(data, /\.filter\(isInspectionStaffAccount\)/)
  assert.match(data, /isInspectionStaffAccount\(account\) && assigneeIds\.has/)
  assert.match(data, /isInspectionStaffAccount\(account\) && account\.availabilityAssigneeId === input\.availabilityAssigneeId/)
  assert.match(appointments, /selectedInspector = staff\.find\(\(account\) => account\.id === resolvedStaffId && isInspectionStaffAccount\(account\)\)/)
  assert.match(workspace, /resolveDefaultInspectionStaffId\(/)
  assert.doesNotMatch(workspace, /selectedLead\.assignedStaffId \|\| \(data\?\.actor\.role === 'agent'/)
})
