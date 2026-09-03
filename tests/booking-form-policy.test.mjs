import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getTomorrowDateString, parseOptionalFloorArea } from '../src/lib/bookingFormPolicy.ts'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('booking availability starts from tomorrow instead of an arbitrary later date', () => {
  assert.equal(getTomorrowDateString(new Date(2026, 8, 3, 1, 0)), '2026-09-04')
  assert.equal(getTomorrowDateString(new Date(2026, 8, 3, 23, 0)), '2026-09-04')

  const form = read('src/components/booking/BookingForm.tsx')
  assert.match(form, /preferredStartDate: getTomorrowDateString\(\)/)
  assert.doesNotMatch(form, /setDate\(d\.getDate\(\) \+ 14\)/)
})

test('floor area is optional with a 100 sqm placeholder and blanks stay unspecified', () => {
  assert.equal(parseOptionalFloorArea(''), undefined)
  assert.equal(parseOptionalFloorArea('   '), undefined)
  assert.equal(parseOptionalFloorArea('250'), 250)

  const form = read('src/components/booking/BookingForm.tsx')
  const route = read('src/app/api/booking/route.ts')
  assert.match(form, /label="Floor Area \(sqm\)" type="number" min=\{1\} placeholder="100"/)
  assert.doesNotMatch(form, /label="Floor Area \(sqm\)"[^\n]*required/)
  assert.doesNotMatch(route, /'floorArea',\s*\n\s*'frequency'/)
  assert.match(route, /Floor area must be a positive number when provided/)
})
