import test from 'node:test'
import assert from 'node:assert/strict'
import { getDashboardQuotes } from '../src/lib/dashboardQuotes.ts'

function database(rows, failAt = -1) {
  const calls = []
  return { calls, from(table) {
    assert.equal(table, 'quotes')
    return { select() { return this }, order() { return this }, async range(start, end) {
      calls.push([start, end])
      return start === failAt ? { data: null, error: { message: 'Unavailable' } } : { data: rows.slice(start, end + 1), error: null }
    } }
  } }
}
test('owner quote directory includes older quotes beyond both historical list caps', async () => {
  const rows = Array.from({ length: 1021 }, (_, id) => ({ id }))
  const db = database(rows)
  const result = await getDashboardQuotes(db)
  assert.deepEqual(result.data, rows)
  assert.deepEqual(db.calls, [[0, 499], [500, 999], [1000, 1499]])
})
test('quote directory handles empty and exact-page datasets and reports later-page failures', async () => {
  assert.deepEqual((await getDashboardQuotes(database([]))).data, [])
  const rows = Array.from({ length: 500 }, (_, id) => ({ id }))
  assert.equal((await getDashboardQuotes(database(rows))).data.length, 500)
  const result = await getDashboardQuotes(database(rows, 500))
  assert.equal(result.data, null)
  assert.equal(result.error.message, 'Unavailable')
})
