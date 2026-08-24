import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isValidAdminAlertId } from '../src/lib/adminAlertId.ts'

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
  assert.match(source, /openDispatchEditor\(alert\.entity_ref, alert\.id\)/)
  assert.match(dispatchPanel, /Assign the site and operator here/)
  assert.match(dispatchPanel, /onBookingOperatorChange/)
  assert.match(dispatchPanel, /Regional agents/)
  assert.match(dispatchPanel, /onBookingAgentChange/)
  assert.match(read('src/app/api/admin/ops/route.ts'), /booking\.assignAgent/)
})

test('action-needed alerts expose a persisted dismiss action', () => {
  const alertsPanel = read('src/components/admin/AlertsPanel.tsx')
  const alerts = read('src/lib/alerts.ts')
  const alertIds = read('src/lib/adminAlertId.ts')
  const opsRoute = read('src/app/api/admin/ops/route.ts')

  assert.match(alertsPanel, /onDismissAlert/)
  assert.match(alertsPanel, /Dismiss/)
  assert.match(alerts, /getDismissedAlertIds/)
  assert.match(alerts, /writeAuditLogStrict\('alert', alertId, 'dismissed'\)/)
  assert.match(alertIds, /booking\(\?:-unassigned\|-overdue\)\?/)
  assert.match(opsRoute, /alert\.dismiss/)
  assert.match(opsRoute, /isValidAdminAlertId\(alertId\)/)
  assert.match(opsRoute, /Select a valid alert\.' \}, \{ status: 400 \}/)
  const dismissButton = read('src/components/admin/DismissAlertButton.tsx')
  const quotePage = read('src/app/admin/quotes/[ref]/page.tsx')
  const bookingEditor = read('src/components/admin/BookingEditor.tsx')
  const dispatchPanel = read('src/components/admin/DispatchPanel.tsx')
  assert.match(dismissButton, /Dismiss reminder/)
  assert.match(quotePage, /alertId=\{`quote-\$\{quote\.quoteRef\}`\}/)
  assert.match(bookingEditor, /selectedAlertId/)
  assert.match(bookingEditor, /onAlertDismissed/)
  assert.match(dispatchPanel, /selectedAlertId/)
  assert.match(dispatchPanel, /onAlertDismissed/)
})

test('alert dismiss accepts generated references and rejects unrelated identifiers', () => {
  assert.equal(isValidAdminAlertId('quote-SC-20260319-XPZ8'), true)
  assert.equal(isValidAdminAlertId('booking-BK-20260319-3EH2'), true)
  assert.equal(isValidAdminAlertId('booking-unassigned-BK-20260319-3EH2'), true)
  assert.equal(isValidAdminAlertId('booking-overdue-BK-20260319-3EH2'), true)
  assert.equal(isValidAdminAlertId('quote/SC-20260319-XPZ8'), false)
  assert.equal(isValidAdminAlertId('unrelated-SC-20260319-XPZ8'), false)
  assert.equal(isValidAdminAlertId(`quote-${'A'.repeat(121)}`), false)
})

test('booking mutations validate lifecycle status server-side', () => {
  const route = read('src/app/api/admin/bookings/[ref]/route.ts')
  const operations = read('src/lib/adminOperations.ts')

  assert.match(route, /isBookingStatus\(updates\.status\)/)
  assert.match(operations, /isBookingStatus\(status\)/)
})
