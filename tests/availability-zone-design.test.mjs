import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const { matchServiceZones } = await import('../src/lib/availability.ts')
const { APPROVED_SERVICE_ZONES } = await import('../src/lib/availabilityZoneCatalog.ts')
const { applyApprovedAvailabilityZoneDesign } = await import('../src/lib/availabilityZoneDesign.ts')

function postcodeMemberships(city) {
  const memberships = new Map()
  for (const zone of APPROVED_SERVICE_ZONES.filter((candidate) => candidate.city === city)) {
    for (const postcode of zone.postcodes) {
      memberships.set(postcode, [...(memberships.get(postcode) ?? []), zone.id])
    }
  }
  return memberships
}

test('approved Sydney and Melbourne coverage has six zones per city and at most one controlled overlap', () => {
  assert.equal(APPROVED_SERVICE_ZONES.filter((zone) => zone.city === 'sydney').length, 6)
  assert.equal(APPROVED_SERVICE_ZONES.filter((zone) => zone.city === 'melbourne').length, 6)

  const sydney = postcodeMemberships('sydney')
  const melbourne = postcodeMemberships('melbourne')

  assert.equal(sydney.size, 235)
  assert.equal(melbourne.size, 256)
  assert.equal([...sydney.values()].reduce((total, zones) => total + zones.length, 0), 343)
  assert.equal([...melbourne.values()].reduce((total, zones) => total + zones.length, 0), 362)
  assert.equal(Math.max(...[...sydney.values()].map((zones) => zones.length)), 2)
  assert.equal(Math.max(...[...melbourne.values()].map((zones) => zones.length)), 2)
})

test('representative core, overlap and boundary postcodes match the approved routes', () => {
  const cases = [
    ['sydney', '2565', ['syd_v2_southwest_macarthur']],
    ['sydney', '2164', ['syd_v2_northwest_west', 'syd_v2_southwest_macarthur']],
    ['sydney', '2150', ['syd_v2_northwest_west', 'syd_v2_central_inner_west']],
    ['melbourne', '3199', ['melb_v2_south_southeast']],
    ['melbourne', '3337', ['melb_v2_west_werribee', 'melb_v2_melton_sunbury_gisborne']],
    ['melbourne', '3145', ['melb_v2_inner_bayside', 'melb_v2_south_southeast']],
    ['melbourne', '3228', ['melb_v2_geelong_torquay']],
  ]

  for (const [city, postcode, expectedZoneIds] of cases) {
    const result = matchServiceZones({ postcode }, city, APPROVED_SERVICE_ZONES)
    assert.equal(result.method, 'postcode')
    assert.deepEqual(result.zones.map((zone) => zone.id), expectedZoneIds)
  }

  for (const [city, postcode] of [['sydney', '2250'], ['melbourne', '3810'], ['melbourne', '3230'], ['melbourne', '3777']]) {
    assert.equal(matchServiceZones({ postcode }, city, APPROVED_SERVICE_ZONES).method, 'none')
  }
})

test('approved design migration preserves agents and block-outs while replacing only route coverage', () => {
  const source = {
    settings: { maxSlotsToShow: 6 },
    zones: [{ id: 'legacy', name: 'Legacy', city: 'sydney', matchTerms: [], postcodes: [], anchors: [] }],
    assignees: [
      { id: 'melb', name: 'Melbourne Agent', city: 'melbourne', active: true },
      { id: 'renata', name: 'Renata', city: 'sydney', active: true },
    ],
    weeklySlots: [
      { id: 'melb_tue_10_3', city: 'melbourne', assigneeId: 'melb', label: 'Tuesday', day: 'tuesday', startTime: '10:00', endTime: '15:00', zoneIds: ['melb_north_west'], active: true },
      { id: 'old-sydney', city: 'sydney', assigneeId: 'renata', label: 'Old', day: 'tuesday', startTime: '10:00', endTime: '15:00', zoneIds: ['legacy'], active: true },
    ],
    oneOffBlocks: [{ id: 'block-1', assigneeId: 'renata', startsAt: '2026-09-10T00:00:00.000Z', endsAt: '2026-09-10T01:00:00.000Z', label: 'Booked out', active: true }],
  }

  const migrated = applyApprovedAvailabilityZoneDesign(source)

  assert.deepEqual(migrated.assignees, source.assignees)
  assert.deepEqual(migrated.oneOffBlocks, source.oneOffBlocks)
  assert.equal(migrated.zones.length, 12)
  assert.deepEqual(
    migrated.weeklySlots.find((slot) => slot.id === 'melb_tue_10_3').zoneIds,
    ['melb_v2_west_werribee', 'melb_v2_melton_sunbury_gisborne'],
  )
  assert.equal(migrated.weeklySlots.filter((slot) => slot.assigneeId === 'renata').length, 6)
  assert.equal(migrated.weeklySlots.filter((slot) => slot.assigneeId === 'renata').reduce((total, slot) => {
    return total + ((Number(slot.endTime.slice(0, 2)) - Number(slot.startTime.slice(0, 2))) + 1)
  }, 0), 12)
})

test('a second active Melbourne agent expands the result limit without changing either agent', () => {
  const config = {
    settings: { maxSlotsToShow: 6 },
    zones: [],
    assignees: [
      { id: 'frankston', name: 'Frankston Agent', city: 'melbourne', active: true },
      { id: 'melton', name: 'Melton Agent', city: 'melbourne', active: true },
    ],
    weeklySlots: [],
    oneOffBlocks: [],
  }

  const migrated = applyApprovedAvailabilityZoneDesign(config)
  assert.equal(migrated.settings.maxSlotsToShow, 12)
  assert.deepEqual(migrated.assignees, config.assignees)
})
