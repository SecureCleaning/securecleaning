import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const { calculateQuote, formatPriceRange } = await import('../src/lib/quoteEngine.ts')
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const {
  deriveQuoteAddOnCountsFromRoomScope,
  defaultMoppingRequiredForType,
  mergeRoomScopeIntoAddOns,
  sanitizePublicRoomScope,
  summarizePublicRoomScope,
} = await import('../src/lib/publicRoomScope.ts')

const baseInputs = {
  businessName: 'Regression Test Office',
  contactName: 'Test Contact',
  email: 'test@example.com',
  phone: '0400000000',
  city: 'melbourne',
  suburb: 'Richmond',
  postcode: '3121',
  premisesType: 'office',
  floorArea: 400,
  floors: 1,
  flooringType: 'mixed',
  frequency: 'weekly',
  timePreference: 'business_hours',
  addOns: {
    bathrooms: 0,
    kitchens: 0,
    windows: 0,
    consumables: false,
    highTouchDisinfection: false,
    carpetSteam: false,
  },
}

test('formatPriceRange collapses identical prices and preserves ranges', () => {
  assert.equal(formatPriceRange(90, 90), '$90')
  assert.equal(formatPriceRange(90, 95), '$90 – $95')
})

test('quote engine applies the minimum call-out after all room extras', () => {
  const result = calculateQuote({
    ...baseInputs,
    floorArea: 10,
    addOns: {
      ...baseInputs.addOns,
      bathrooms: 1,
      kitchens: 1,
    },
  })

  assert.equal(result.addOnsTotal, 58)
  assert.equal(result.totalLow, DEFAULT_QUOTE_PRICING_CONFIG.settings.minimumInvoice)
  assert.equal(result.totalHigh, DEFAULT_QUOTE_PRICING_CONFIG.settings.minimumInvoice)
})

test('quote engine prices a standard bathroom at the configured base charge', () => {
  const result = calculateQuote({
    ...baseInputs,
    floorArea: 400,
    addOns: {
      ...baseInputs.addOns,
      bathrooms: 1,
    },
  }, {
    ...DEFAULT_QUOTE_PRICING_CONFIG,
    settings: { ...DEFAULT_QUOTE_PRICING_CONFIG.settings, minimumInvoice: 0 },
  })

  assert.equal(result.breakdown.addOnsDetail.bathroomsTotal, 8)
  assert.equal(result.addOnsTotal, 8)
})

test('room scope derives bathroom and kitchen counts from selected rooms', () => {
  const scope = [
    { id: 'female', type: 'female_bathroom', label: 'Female bathroom', quantity: 1 },
    { id: 'male', type: 'male_bathroom', label: 'Male bathroom', quantity: 1 },
    { id: 'accessible', type: 'accessible_bathroom', label: 'Accessible bathroom', quantity: 1 },
    { id: 'kitchen', type: 'kitchen', label: 'Kitchen', quantity: 2 },
  ]

  assert.deepEqual(deriveQuoteAddOnCountsFromRoomScope(scope), {
    bathrooms: 3,
    kitchens: 2,
    meetingRooms: 0,
  })
  assert.deepEqual(mergeRoomScopeIntoAddOns(scope, { bathrooms: 99, kitchens: 99 }).bathrooms, 3)
})

test('room scope sanitization applies safe defaults and retains client labels', () => {
  const [room] = sanitizePublicRoomScope([
    { type: 'kitchen', label: 'Staff kitchen', quantity: '2' },
    { type: 'not-a-room', label: '', quantity: 0 },
  ])

  assert.equal(room.type, 'kitchen')
  assert.equal(room.label, 'Staff kitchen')
  assert.equal(room.quantity, 2)
  assert.equal(room.moppingRequired, true)

  const invalidRoom = sanitizePublicRoomScope([
    { type: 'not-a-room', label: '', quantity: 0 },
  ])[0]
  assert.equal(invalidRoom.type, 'other')
  assert.equal(invalidRoom.quantity, 1)
  assert.equal(defaultMoppingRequiredForType('meeting_room'), false)
})

test('room scope summary includes mopping only when selected', () => {
  const summary = summarizePublicRoomScope([
    { id: 'hall', type: 'hallway', label: 'Hallway', quantity: 1, moppingRequired: true },
    { id: 'board', type: 'meeting_room', label: 'Boardroom', quantity: 1, moppingRequired: false },
  ])

  assert.deepEqual(summary, ['Hallway x1 · mopping requested', 'Boardroom x1'])
})
