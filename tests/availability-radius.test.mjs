import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const { matchServiceZones, validateAvailabilityZoneConfig } = await import('../src/lib/availability.ts')
const root = fileURLToPath(new URL('..', import.meta.url))

const anchor = { id: 'cbd', label: 'Sydney CBD', latitude: -33.8688, longitude: 151.2093, radiusKm: 10 }
const baseZone = {
  id: 'sydney-zone',
  name: 'Sydney Zone',
  city: 'sydney',
  matchTerms: ['Surry Hills'],
  postcodes: ['2000'],
  excludedMatchTerms: [],
  excludedPostcodes: [],
  anchors: [anchor],
}

test('zone matching applies postcode, suburb, then radius precedence', () => {
  const postcodeZone = { ...baseZone, id: 'postcode-zone' }
  const suburbZone = { ...baseZone, id: 'suburb-zone', postcodes: [], anchors: [] }

  const postcode = matchServiceZones({ suburb: 'Surry Hills', postcode: '2000' }, 'sydney', [suburbZone, postcodeZone])
  assert.equal(postcode.method, 'postcode')
  assert.deepEqual(postcode.zones.map((zone) => zone.id), ['postcode-zone'])

  const suburb = matchServiceZones({ suburb: 'Surry Hills', postcode: '2010' }, 'sydney', [suburbZone])
  assert.equal(suburb.method, 'suburb')

  const radius = matchServiceZones({ suburb: 'Unlisted', postcode: '2999', latitude: -33.8688, longitude: 151.2093 }, 'sydney', [baseZone])
  assert.equal(radius.method, 'radius')
  assert.equal(radius.distanceKm, 0)
})

test('exclusions override exact and radius matches', () => {
  const excluded = {
    ...baseZone,
    excludedMatchTerms: ['Surry Hills'],
    excludedPostcodes: ['2000'],
  }
  assert.equal(matchServiceZones({ suburb: 'Surry Hills', postcode: '2000' }, 'sydney', [excluded]).method, 'none')
  assert.equal(matchServiceZones({ suburb: 'Surry Hills', postcode: '2000', latitude: -33.8688, longitude: 151.2093 }, 'sydney', [excluded]).method, 'none')
})

test('radius matching includes its boundary, supports overlaps, and sorts nearest first', () => {
  const boundaryLatitude = anchor.latitude + (10 / 111.195)
  const withinBoundary = { ...baseZone, anchors: [{ ...anchor, radiusKm: 10.01 }] }
  const outsideBoundary = { ...baseZone, id: 'outside', anchors: [{ ...anchor, radiusKm: 9.9 }] }
  const overlap = { ...baseZone, id: 'overlap', anchors: [{ ...anchor, latitude: boundaryLatitude, radiusKm: 10 }] }

  const result = matchServiceZones({ latitude: boundaryLatitude, longitude: anchor.longitude }, 'sydney', [withinBoundary, outsideBoundary, overlap])
  assert.equal(result.method, 'radius')
  assert.deepEqual(result.zones.map((zone) => zone.id), ['overlap', 'sydney-zone'])
})

test('malformed or missing coordinates do not trigger radius matching and city remains isolated', () => {
  assert.equal(matchServiceZones({ suburb: 'Unlisted' }, 'sydney', [baseZone]).method, 'none')
  assert.equal(matchServiceZones({ suburb: 'Unlisted', latitude: Number.NaN, longitude: 151.2 }, 'sydney', [baseZone]).method, 'none')
  assert.equal(matchServiceZones({ suburb: 'Surry Hills', postcode: '2000' }, 'melbourne', [baseZone]).method, 'none')
})

test('zone configuration rejects malformed anchors and accepts bounded Australian anchors', () => {
  assert.equal(validateAvailabilityZoneConfig({ zones: [baseZone] }), null)
  assert.match(validateAvailabilityZoneConfig({
    zones: [{ ...baseZone, anchors: [{ ...anchor, radiusKm: 0 }] }],
  }), /radius from 0\.1 to 100 km/)
  assert.match(validateAvailabilityZoneConfig({
    zones: [{ ...baseZone, anchors: [{ ...anchor, latitude: 12 }] }],
  }), /Australian coordinates/)
})

test('booking radius selection is re-geocoded server-side and zone definitions remain admin-only', () => {
  const bookingRoute = readFileSync(`${root}/src/app/api/booking/route.ts`, 'utf8')
  const availabilityRoute = readFileSync(`${root}/src/app/api/availability/route.ts`, 'utf8')
  const agentRoute = readFileSync(`${root}/src/app/api/availability-agent/[assigneeId]/route.ts`, 'utf8')
  const admin = readFileSync(`${root}/src/components/admin/AvailabilityAdmin.tsx`, 'utf8')
  const bookingForm = readFileSync(`${root}/src/components/booking/BookingForm.tsx`, 'utf8')
  const agentEditor = readFileSync(`${root}/src/components/availability/AssigneeAvailabilityEditor.tsx`, 'utf8')

  assert.match(bookingRoute, /verifyAddressCoordinates/)
  assert.doesNotMatch(bookingRoute, /latitude: inputs\.latitude/)
  assert.match(bookingRoute, /latitude: _browserLatitude, longitude: _browserLongitude/)
  assert.match(availabilityRoute, /Coordinates are invalid/)
  assert.match(bookingForm, /latitude: suggestion\.latitude \? Number\(suggestion\.latitude\)/)
  assert.match(bookingForm, /latitude: undefined, longitude: undefined/)
  assert.match(admin, /Radius anchors/)
  assert.match(admin, /Excluded suburbs/)
  assert.match(agentEditor, /Radius coverage/)
  assert.doesNotMatch(agentEditor, /updateZone/)
  assert.match(agentRoute, /body\?\.weeklySlots/)
  assert.doesNotMatch(agentRoute, /body\?\.zones/)
})
