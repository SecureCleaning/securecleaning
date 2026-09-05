import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const { calculateQuote, formatPriceRange } = await import('../src/lib/quoteEngine.ts')
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const { getRoomMetricExtraTotal, getRoomScheduledTaskExtraTotal } = await import('../src/lib/quoteWorkflow.ts')
const {
  applySuggestedRoomTypePrices,
  DEFAULT_QUOTE_ROOM_TYPE_CONFIG,
  DEFAULT_WEEKLY_DUSTING_TASK,
  ensureWeeklyPerimeterSurfaceDusting,
  getRoomScopeTaskSchedule,
  getRoomTaskAmortizationFactor,
  getRoomTypeDefaultDirectCharge,
} = await import('../src/lib/roomTypeConfig.ts')
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

test('quote engine applies the frequency-adjusted minimum after all room extras', () => {
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
  const expectedMinimum = DEFAULT_QUOTE_PRICING_CONFIG.settings.minimumInvoice *
    DEFAULT_QUOTE_PRICING_CONFIG.multipliers.frequency.weekly
  assert.equal(result.totalLow, expectedMinimum)
  assert.equal(result.totalHigh, expectedMinimum)
})

test('quote engine applies the frequency multiplier to the minimum invoice', () => {
  const pricingConfig = {
    ...DEFAULT_QUOTE_PRICING_CONFIG,
    settings: { ...DEFAULT_QUOTE_PRICING_CONFIG.settings, minimumInvoice: 90 },
    multipliers: {
      ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers,
      frequency: {
        ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers.frequency,
        fortnightly: 1.1,
      },
    },
  }
  const result = calculateQuote({
    ...baseInputs,
    floorArea: 10,
    frequency: 'fortnightly',
  }, pricingConfig)

  assert.equal(result.totalLow, 99)
  assert.equal(result.totalHigh, 99)
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

test('room type admin default direct charge matches quote room and default field charges', () => {
  const bathroom = DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes.find((roomType) => roomType.id === 'bathroom')
  const maleBathroom = DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes.find((roomType) => roomType.id === 'male_bathroom')
  const kitchen = DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes.find((roomType) => roomType.id === 'kitchen')
  const office = DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes.find((roomType) => roomType.id === 'office')

  assert.equal(getRoomTypeDefaultDirectCharge(bathroom, DEFAULT_QUOTE_PRICING_CONFIG), 8)
  assert.equal(getRoomTypeDefaultDirectCharge(maleBathroom, DEFAULT_QUOTE_PRICING_CONFIG), 10.5)
  assert.equal(getRoomTypeDefaultDirectCharge(kitchen, DEFAULT_QUOTE_PRICING_CONFIG), 50)
  assert.equal(getRoomTypeDefaultDirectCharge(office, DEFAULT_QUOTE_PRICING_CONFIG), 0)
})

test('quote room fields can exclude saved fields and price quote-specific blank fields', () => {
  const draft = {
    roomItems: [{
      id: 'room-1', type: 'office', label: 'Office', quantity: 2, size: 20, floor: 1,
      metrics: { bins: 99, extra_desks: 5 },
      excludedMetricFieldIds: ['bins'],
      customMetricFields: [{ id: 'extra_desks', label: 'Extra desks', inputType: 'integer', defaultValue: 0, includedUnits: 1, pricePerUnit: 2 }],
    }],
  }

  assert.equal(getRoomMetricExtraTotal(draft, DEFAULT_QUOTE_ROOM_TYPE_CONFIG), 16)
})

test('periodic task prices are amortised across the configured cleaning frequency', () => {
  assert.equal(getRoomTaskAmortizationFactor('weekly', 'daily'), 0.2)
  assert.equal(getRoomTaskAmortizationFactor('monthly', 'weekly'), 12 / 52)
  assert.equal(getRoomTaskAmortizationFactor('weekly', 'fortnightly'), 1)
  assert.equal(getRoomTaskAmortizationFactor('monthly', 'once_off'), 1)

  const config = {
    roomTypes: [{
      id: 'office', label: 'Office', defaultLabel: 'Office', tracksSize: true, defaultSize: 20,
      defaultMopping: false, scopeTasks: ['Dust desks', 'Remove cobwebs'],
      scopeTaskCadences: ['weekly', 'monthly'], scopeTaskPrices: [10, 26],
      pricingAdjustmentPercent: 0, fixedPricePerVisit: 3, fields: [],
    }],
  }
  const draft = {
    revisedInputs: { frequency: 'daily' },
    roomItems: [{ id: 'room-1', type: 'office', label: 'Office', quantity: 2, size: 20, floor: 1 }],
  }

  assert.equal(getRoomScheduledTaskExtraTotal(draft, config), 6.4)
})

test('scope task schedules expose the task cadence and suggested prices remove zero room bases', () => {
  const office = {
    id: 'office', label: 'Office', defaultLabel: 'Office', tracksSize: true, defaultSize: 20,
    defaultMopping: false, scopeTasks: ['Dust desks', 'Remove cobwebs'],
    pricingAdjustmentPercent: 0, fixedPricePerVisit: 0, fields: [],
  }
  assert.deepEqual(getRoomScopeTaskSchedule(office), [
    { label: 'Dust desks', cadence: 'weekly' },
    { label: 'Remove cobwebs', cadence: 'monthly' },
  ])

  const suggested = applySuggestedRoomTypePrices({ roomTypes: [{ ...office, scopeTasks: ['Dust desks'] }] }, DEFAULT_QUOTE_PRICING_CONFIG)
  assert.equal(getRoomTypeDefaultDirectCharge(suggested.roomTypes[0], DEFAULT_QUOTE_PRICING_CONFIG), 3)
  assert.equal(suggested.roomTypes[0].scopeTasks[0], 'Remove visible cobwebs from ceilings and corners')
  assert.equal(suggested.roomTypes[0].scopeTaskCadences[0], 'monthly')
})

test('every room includes weekly perimeter and surface dusting without duplicates', () => {
  for (const roomType of DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes) {
    const dustingTasks = getRoomScopeTaskSchedule(roomType).filter(({ label }) => (
      label.toLowerCase().includes('dust')
      && (label.toLowerCase().includes('perimeter') || label.toLowerCase().includes('surface'))
    ))
    assert.equal(dustingTasks.length, 1, `${roomType.id} should have one perimeter/surface dusting task`)
    assert.equal(dustingTasks[0].cadence, 'weekly')
  }

  const legacyRoom = {
    id: 'legacy', label: 'Legacy room', defaultLabel: 'Legacy room', tracksSize: true, defaultSize: 20,
    defaultMopping: false, scopeTasks: ['Vacuum floors'], scopeTaskCadences: ['every_clean'], scopeTaskPrices: [0],
    pricingAdjustmentPercent: 0, fixedPricePerVisit: 5, fields: [],
  }
  const upgraded = ensureWeeklyPerimeterSurfaceDusting(legacyRoom)
  assert.equal(upgraded.scopeTasks.at(-1), DEFAULT_WEEKLY_DUSTING_TASK)
  assert.equal(upgraded.scopeTaskCadences.at(-1), 'weekly')
  assert.equal(upgraded.scopeTaskPrices.at(-1), 0)
  assert.equal(ensureWeeklyPerimeterSurfaceDusting(upgraded).scopeTasks.length, upgraded.scopeTasks.length)
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
    { id: 'stairs', type: 'stairs', label: 'Stairs', quantity: 2, moppingRequired: false },
  ])

  assert.deepEqual(summary, ['Hallway x1 · mopping requested', 'Boardroom x1', 'Stairs x2'])
})

test('stairs remain a recognized room type throughout public quote scope sanitization', () => {
  const [stairs] = sanitizePublicRoomScope([
    { id: 'stairs', type: 'stairs', label: '', quantity: 3, moppingRequired: true, isCustom: true },
  ])

  assert.deepEqual(stairs, {
    id: 'stairs',
    type: 'stairs',
    label: 'Stairs',
    quantity: 3,
    moppingRequired: true,
    isCustom: true,
  })
})
