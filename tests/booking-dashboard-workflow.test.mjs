import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  isActiveBooking,
  matchesBookingQueue,
  needsBookingAssignment,
  needsInspectionAction,
} from '../src/lib/bookingWorkflow.ts'

const dashboard = readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8')
const reportingPanel = readFileSync(new URL('../src/components/admin/ReportingPanel.tsx', import.meta.url), 'utf8')
const alerts = readFileSync(new URL('../src/lib/alerts.ts', import.meta.url), 'utf8')

test('closed bookings leave every active operations queue', () => {
  const completed = {
    status: 'completed',
    site_id: null,
    assigned_operator_id: null,
    inspection_status: 'scheduled',
    inputs: {},
  }

  assert.equal(isActiveBooking(completed), false)
  assert.equal(needsBookingAssignment(completed), false)
  assert.equal(needsInspectionAction(completed), false)
  assert.equal(matchesBookingQueue(completed, 'pending'), false)
  assert.equal(matchesBookingQueue(completed, 'unassigned'), false)
  assert.equal(matchesBookingQueue(completed, 'inspections'), false)
  assert.equal(matchesBookingQueue(completed, 'closed'), true)
})

test('assignment and inspection queues use explicit active-work rules', () => {
  const pending = {
    status: 'pending',
    site_id: null,
    assigned_operator_id: null,
    inspection_status: 'pending',
    inputs: {},
  }
  const assigned = {
    ...pending,
    status: 'confirmed',
    site_id: 'site-1',
    inputs: { preferredInspectionAssigneeId: 'agent-1' },
  }

  assert.equal(needsBookingAssignment(pending), true)
  assert.equal(needsInspectionAction(pending), true)
  assert.equal(needsBookingAssignment(assigned), false)
  assert.equal(needsInspectionAction(assigned), true)
})

test('dashboard cards select distinct queues and closed records have a history view', () => {
  assert.match(reportingPanel, /bookings-pending/)
  assert.match(reportingPanel, /bookings-unassigned/)
  assert.match(reportingPanel, /bookings-inspections/)
  assert.match(reportingPanel, /Needs assignment/)
  assert.match(reportingPanel, /Inspection actions/)
  assert.match(dashboard, /Closed \/ history/)
  assert.match(dashboard, /Search this queue/)
  assert.match(dashboard, /id="booking-queue"/)
  assert.match(dashboard, /id="dispatch-editor"/)
  assert.match(dashboard, /Inspection unresolved/)
})

test('overdue inspection alerts exclude closed booking history', () => {
  const overdueQuery = alerts.slice(
    alerts.indexOf(".eq('inspection_status', 'scheduled')"),
    alerts.indexOf("const alertsById"),
  )

  assert.match(overdueQuery, /\.neq\('status', 'completed'\)/)
  assert.match(overdueQuery, /\.neq\('status', 'cancelled'\)/)
})
