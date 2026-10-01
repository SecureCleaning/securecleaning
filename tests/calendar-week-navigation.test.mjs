import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDashboardWeek, parseDashboardWeekOffset } from '../src/lib/agentDashboardPolicy.ts'

test('next dashboard week crosses daylight saving without losing local appointment dates', () => {
  const event = { id: 'next', startsAt: '2026-10-07T23:30:00Z' }
  const week = buildDashboardWeek([event], new Date('2026-10-01T03:00:00Z'), 'Australia/Sydney', 1)
  assert.equal(week[0].key, '2026-10-08')
  assert.equal(week[6].key, '2026-10-14')
  assert.deepEqual(week[0].events, [event])
  assert.equal(week.some(day => day.isToday), false)
})

test('dashboard week input is bounded and rejects malformed offsets', () => {
  for (const value of [undefined, ['1'], '-1', '1.5', 'NaN']) assert.equal(parseDashboardWeekOffset(value), 0)
  assert.equal(parseDashboardWeekOffset('2'), 2)
  assert.equal(parseDashboardWeekOffset('99999'), 52)
})
