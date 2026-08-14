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

  assert.match(source, /alert\.kind === 'new_booking'/)
  assert.match(source, /openDispatchEditor\(alert\.entity_ref\)/)
})

test('booking mutations validate lifecycle status server-side', () => {
  const route = read('src/app/api/admin/bookings/[ref]/route.ts')
  const operations = read('src/lib/adminOperations.ts')

  assert.match(route, /isBookingStatus\(updates\.status\)/)
  assert.match(operations, /isBookingStatus\(status\)/)
})
