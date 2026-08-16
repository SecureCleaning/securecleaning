import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cleanerServiceAreasForImportUpdate,
  cleanServiceAreas,
  defaultCleanerServiceAreas,
  normaliseCleanerServiceAreas,
} from '../src/lib/cleanerServiceAreas.ts'

test('defaults empty service areas to the nominated suburb plus 20 km', () => {
  assert.deepEqual(defaultCleanerServiceAreas('  Richmond  '), ['Richmond + 20 km'])
  assert.deepEqual(normaliseCleanerServiceAreas([], 'Richmond'), ['Richmond + 20 km'])
  assert.deepEqual(normaliseCleanerServiceAreas(['  '], 'Richmond'), ['Richmond + 20 km'])
  assert.deepEqual(defaultCleanerServiceAreas('   '), [])
})

test('cleans and preserves multiple service areas within storage limits', () => {
  const areas = cleanServiceAreas([' Richmond ', 'richmond', 'Southbank', '', ...Array.from({ length: 40 }, (_, index) => `Area ${index}`)])
  assert.deepEqual(areas.slice(0, 2), ['Richmond', 'Southbank'])
  assert.equal(areas.length, 30)
  assert.ok(areas.every((area) => area.length <= 80))
})

test('keeps explicit areas instead of replacing them with the fallback', () => {
  assert.deepEqual(
    normaliseCleanerServiceAreas(['Richmond + 10 km', 'Southbank'], 'Richmond'),
    ['Richmond + 10 km', 'Southbank'],
  )
})

test('blank import areas preserve an existing cleaner while explicit areas replace them', () => {
  assert.equal(cleanerServiceAreasForImportUpdate([]), undefined)
  assert.equal(cleanerServiceAreasForImportUpdate(['  ']), undefined)
  assert.deepEqual(cleanerServiceAreasForImportUpdate([' Richmond ', 'Southbank']), ['Richmond', 'Southbank'])
})

test('keeps generated defaults inside the service-area length limit', () => {
  const [area] = defaultCleanerServiceAreas('A'.repeat(100))
  assert.equal(area.length, 80)
  assert.match(area, / \+ 20 km$/)
})
