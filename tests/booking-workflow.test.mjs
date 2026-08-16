import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('booking editor exposes the lifecycle status used by action-needed alerts', () => {
  const source = read('src/components/admin/BookingEditor.tsx')

  assert.match(source, /Booking status/)
  assert.match(source, /bookingStatuses\.map/)
  assert.match(source, /status: bookingStatus/)
})

test('issue routing sends dispatch alerts to the inspection workflow controls', () => {
  const source = read('src/components/admin/AdminDashboard.tsx')
  const dispatchPanel = read('src/components/admin/DispatchPanel.tsx')

  assert.match(source, /alert\.kind === 'new_booking'/)
  assert.match(source, /openDispatchEditor\(alert\.entity_ref\)/)
  assert.match(dispatchPanel, /Assign the site and operator here/)
  assert.match(dispatchPanel, /onBookingOperatorChange/)
  assert.match(dispatchPanel, /Regional agents/)
  assert.match(dispatchPanel, /onBookingAgentChange/)
  assert.match(read('src/app/api/admin/ops/route.ts'), /booking\.assignAgent/)
})

test('action-needed alerts expose a persisted dismiss action', () => {
  const alertsPanel = read('src/components/admin/AlertsPanel.tsx')
  const alerts = read('src/lib/alerts.ts')
  const opsRoute = read('src/app/api/admin/ops/route.ts')

  assert.match(alertsPanel, /onDismissAlert/)
  assert.match(alertsPanel, /Dismiss/)
  assert.match(alerts, /getDismissedAlertIds/)
  assert.match(alerts, /writeAuditLog\('alert', alertId, 'dismissed'\)/)
  assert.match(opsRoute, /alert\.dismiss/)
})

test('booking mutations validate lifecycle status server-side', () => {
  const route = read('src/app/api/admin/bookings/[ref]/route.ts')
  const operations = read('src/lib/adminOperations.ts')

  assert.match(route, /isBookingStatus\(updates\.status\)/)
  assert.match(operations, /isBookingStatus\(status\)/)
})
