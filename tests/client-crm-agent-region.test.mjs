import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { canAgentSelfAssignCrmRegion } = await import('../src/lib/clientCrmAssignment.ts')
const projectRoot = fileURLToPath(new URL('..', import.meta.url))

const assignees = [
  { id: 'renata-nsw', city: 'sydney', active: true },
  { id: 'melbourne-agent', city: 'melbourne', active: true },
  { id: 'inactive-nsw', city: 'sydney', active: false },
]

test('an active NSW agent can create a Wetherill Park CRM opportunity outside inspection-route postcodes', () => {
  assert.equal(canAgentSelfAssignCrmRegion({
    availabilityAssigneeId: 'renata-nsw',
    city: 'sydney',
    assignees,
  }), true)
})

test('CRM self-assignment remains blocked across states and for inactive or missing profiles', () => {
  assert.equal(canAgentSelfAssignCrmRegion({ availabilityAssigneeId: 'renata-nsw', city: 'melbourne', assignees }), false)
  assert.equal(canAgentSelfAssignCrmRegion({ availabilityAssigneeId: 'inactive-nsw', city: 'sydney', assignees }), false)
  assert.equal(canAgentSelfAssignCrmRegion({ availabilityAssigneeId: null, city: 'sydney', assignees }), false)
})

test('manual CRM creation uses state-level agent authorization while preserving postcode suggestions', () => {
  const data = readFileSync(`${projectRoot}/src/lib/clientCrmData.ts`, 'utf8')
  const workspace = readFileSync(`${projectRoot}/src/components/admin/ClientCrmWorkspace.tsx`, 'utf8')

  assert.match(data, /canAgentSelfAssignCrmRegion/)
  assert.match(data, /assignedStaffId = actor\.id/)
  assert.match(data, /assignmentMethod = 'agent_self'/)
  assert.match(data, /outside your assigned state or service region/)
  assert.match(workspace, /Agents can create records within their assigned state/)
})
