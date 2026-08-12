import test from 'node:test'
import assert from 'node:assert/strict'

import { rankAdminAlerts } from '../src/lib/adminAlertRanking.mjs'

test('rankAdminAlerts prioritizes severity before timestamp', () => {
  const ranked = rankAdminAlerts([
    { id: 'info-newer', severity: 'info', happenedAt: 300 },
    { id: 'warning-newer', severity: 'warning', happenedAt: 250 },
    { id: 'critical-newer', severity: 'critical', happenedAt: 200 },
    { id: 'critical-older', severity: 'critical', happenedAt: 100 },
    { id: 'warning-older', severity: 'warning', happenedAt: 150 },
  ])

  assert.deepEqual(
    ranked.map((alert) => alert.id),
    ['critical-older', 'critical-newer', 'warning-older', 'warning-newer', 'info-newer']
  )
})

test('rankAdminAlerts truncates only after prioritization', () => {
  const infoAlerts = Array.from({ length: 25 }, (_, index) => ({
    id: `info-${index + 1}`,
    severity: 'info',
    happenedAt: 1000 + index,
  }))

  const ranked = rankAdminAlerts([
    ...infoAlerts,
    { id: 'warning-1', severity: 'warning', happenedAt: 50 },
    { id: 'warning-2', severity: 'warning', happenedAt: 60 },
    { id: 'critical-1', severity: 'critical', happenedAt: 10 },
  ])

  assert.equal(ranked.length, 20)
  assert.equal(ranked[0].id, 'critical-1')
  assert.deepEqual(
    ranked.slice(0, 3).map((alert) => alert.id),
    ['critical-1', 'warning-1', 'warning-2']
  )
  assert(!ranked.some((alert) => alert.id === 'info-18'))
})

test('rankAdminAlerts does not mutate the input array', () => {
  const original = [
    { id: 'warning', severity: 'warning', happenedAt: 200 },
    { id: 'critical', severity: 'critical', happenedAt: 100 },
  ]

  const snapshot = original.map((alert) => ({ ...alert }))
  const ranked = rankAdminAlerts(original)

  assert.deepEqual(original, snapshot)
  assert.notStrictEqual(ranked, original)
})
