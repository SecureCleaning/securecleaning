import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const {
  bookingBelongsToAvailabilityAssignee,
  validateOwnerOperatorLinks,
} = await import('../src/lib/availabilityLinkage.ts')

const agent = {
  id: 'agent-melbourne',
  name: 'Melbourne Agent',
  city: 'melbourne',
  ownerOperatorId: 'operator-melbourne',
  active: true,
}

const zone = {
  id: 'inner-melbourne',
  name: 'Inner Melbourne',
  city: 'melbourne',
  matchTerms: ['Richmond'],
  postcodes: ['3121'],
}

function booking(overrides = {}) {
  return {
    assigned_operator_id: null,
    inputs: {
      city: 'melbourne',
      suburb: 'Richmond',
      postcode: '3121',
      ...overrides.inputs,
    },
    ...overrides,
  }
}

test('schedule ownership accepts either the inspection agent or linked owner-operator', () => {
  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    inputs: { city: 'melbourne', suburb: 'Richmond', preferredInspectionAssigneeId: agent.id },
  }), agent, [zone]), true)

  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: agent.ownerOperatorId,
  }), agent, [zone]), true)
})

test('an explicit inspection assignee takes precedence over a conflicting linked operator', () => {
  const conflictingBooking = booking({
    assigned_operator_id: agent.ownerOperatorId,
    inputs: {
      city: 'melbourne',
      suburb: 'Richmond',
      preferredInspectionAssigneeId: 'another-agent',
    },
  })

  assert.equal(bookingBelongsToAvailabilityAssignee(conflictingBooking, agent, [zone]), false)
  assert.equal(bookingBelongsToAvailabilityAssignee(
    conflictingBooking,
    { ...agent, id: 'another-agent', ownerOperatorId: 'another-operator' },
    [zone],
  ), true)
})

test('schedule ownership rejects another city, service region, agent, and inactive agent', () => {
  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: agent.ownerOperatorId,
    inputs: { city: 'sydney', suburb: 'Richmond' },
  }), agent, [zone]), false)

  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: agent.ownerOperatorId,
    inputs: { city: 'melbourne', suburb: 'Geelong', postcode: '3220' },
  }), agent, [zone]), false)

  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: 'another-operator',
    inputs: { city: 'melbourne', suburb: 'Richmond', preferredInspectionAssigneeId: 'another-agent' },
  }), agent, [zone]), false)

  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: agent.ownerOperatorId,
  }), { ...agent, active: false }, [zone]), false)
})

test('agents without configured service zones remain limited by city and ownership', () => {
  assert.equal(bookingBelongsToAvailabilityAssignee(booking({
    assigned_operator_id: agent.ownerOperatorId,
    inputs: { city: 'melbourne', suburb: 'Geelong' },
  }), agent, []), true)
})

function configWithAssignees(assignees) {
  return {
    settings: { maxSlotsToShow: 6 },
    zones: [],
    assignees,
    weeklySlots: [],
    oneOffBlocks: [],
  }
}

const operator = { id: 'operator-melbourne', city: 'melbourne', is_active: true }

test('owner-operator linkage validation accepts one active same-city link', () => {
  assert.equal(validateOwnerOperatorLinks(configWithAssignees([agent]), [operator]), null)
})

test('owner-operator linkage validation rejects missing, inactive, cross-city, and duplicate links', () => {
  assert.match(validateOwnerOperatorLinks(configWithAssignees([agent]), []), /could not be found/)
  assert.match(validateOwnerOperatorLinks(configWithAssignees([agent]), [{ ...operator, is_active: false }]), /must be active/)
  assert.match(validateOwnerOperatorLinks(configWithAssignees([agent]), [{ ...operator, city: 'sydney' }]), /same city/)
  assert.match(validateOwnerOperatorLinks(configWithAssignees([
    agent,
    { ...agent, id: 'second-agent' },
  ]), [operator]), /only be linked to one/)
})

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

function source(relativePath) {
  return readFileSync(`${projectRoot}/${relativePath}`, 'utf8')
}

test('calendar and booking mutations share the linkage predicate and operator identifier', () => {
  const calendarSource = source('src/lib/availabilityCalendar.ts')
  const bookingRouteSource = source('src/app/api/availability-agent/[assigneeId]/bookings/[bookingRef]/route.ts')

  assert.match(calendarSource, /bookingBelongsToAvailabilityAssignee\(booking, assignee, serviceZones\)/)
  assert.match(calendarSource, /select\('booking_ref, status, created_at, inputs, assigned_operator_id'\)/)

  assert.match(bookingRouteSource, /select\('booking_ref, status, inspection_status, inspection_scheduled_for, assigned_operator_id, inputs'\)/)
  assert.equal((bookingRouteSource.match(/bookingBelongsToAvailabilityAssignee\(/g) ?? []).length, 2)
  assert.equal((bookingRouteSource.match(/getAssignedBooking\(config, assignee, params\.bookingRef\)/g) ?? []).length, 2)
  assert.match(bookingRouteSource, /if \(!bookingBelongsToAvailabilityAssignee\(row, assignee, serviceZones\)\) return false/)
})

test('admin schedule links are encoded and destination pages retain role-bound authorization', () => {
  const dashboardSource = source('src/components/admin/AdminDashboard.tsx')
  const adminPageSource = source('src/app/admin/availability/quoters/[assigneeId]/page.tsx')
  const agentPageSource = source('src/app/availability/quoters/[assigneeId]/page.tsx')

  assert.match(
    dashboardSource,
    /href=\{`\/admin\/availability\/quoters\/\$\{encodeURIComponent\(linkedAgentId\)\}`\}/,
  )
  assert.match(adminPageSource, /return withAdminPage\(async \(\) => \{/)
  assert.match(agentPageSource, /hasAvailabilityAgentSession\(assigneeId\)/)
  assert.match(agentPageSource, /apiPath=\{`\/api\/availability-agent\/\$\{assigneeId\}`\}/)
})

test('agent schedule explains the suburb and postcode coverage for every inspection zone', () => {
  const editorSource = source('src/components/availability/AssigneeAvailabilityEditor.tsx')
  const agentRouteSource = source('src/app/api/availability-agent/[assigneeId]/route.ts')

  assert.match(editorSource, /Inspection zone coverage/)
  assert.match(editorSource, /zone\.matchTerms\.map/)
  assert.match(editorSource, /zone\.postcodes\.map/)
  assert.match(editorSource, /<details key=\{zone\.id\}/)
  assert.match(agentRouteSource, /zones: config\.zones\.filter\(\(zone\) => zone\.city === assignee\.city\)/)
  assert.doesNotMatch(editorSource, /body: JSON\.stringify\(\{ weeklySlots, oneOffBlocks, zones \}\)/)
})
