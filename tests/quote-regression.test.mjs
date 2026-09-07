import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const { calculateQuote, formatPriceRange } = await import('../src/lib/quoteEngine.ts')
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const { buildFirmQuotePreview, deriveQuoteInputsFromRooms, getRoomMetricExtraTotal, getRoomScheduledTaskExtraTotal } = await import('../src/lib/quoteWorkflow.ts')
const {
  applySuggestedRoomTypePrices,
  DEFAULT_MONTHLY_COBWEB_TASK,
  DEFAULT_QUOTE_ROOM_TYPE_CONFIG,
  DEFAULT_VACUUM_TASK,
  DEFAULT_WEEKLY_DUSTING_TASK,
  ensureStandardRoomTasks,
  ensureWeeklyPerimeterSurfaceDusting,
  getDefaultRoomScopeTaskSelections,
  getRoomScopeTaskDefinitions,
  getRoomScopeTaskEffectiveRate,
  getRoomScopeTaskMinutesPerSqm,
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

  const roomType = config.roomTypes[0]
  const selections = getDefaultRoomScopeTaskSelections(roomType)
  selections[getRoomScopeTaskDefinitions(roomType)[0].id] = false
  assert.ok(Math.abs(getRoomScheduledTaskExtraTotal({
    ...draft,
    roomItems: [{ ...draft.roomItems[0], scopeTaskSelections: selections }],
  }, config) - 2.4) < 0.000001)
})

test('selected area tasks use square metres and fixed tasks use room quantity', () => {
  const config = {
    roomTypes: [{
      id: 'office', label: 'Office', defaultLabel: 'Office', tracksSize: true, defaultSize: 20,
      defaultMopping: false, scopeTasks: ['Vacuum floors', 'Empty bins'],
      scopeTaskCadences: ['every_clean', 'every_clean'], scopeTaskPrices: [0, 0.75],
      scopeTaskMinutesPerSqm: [0.12, 0],
      scopeTaskDefaults: [true, true], pricingAdjustmentPercent: 0, fixedPricePerVisit: 0, fields: [],
    }],
  }
  const draft = {
    revisedInputs: { frequency: 'weekly' },
    roomItems: [{ id: 'room-1', type: 'office', label: 'Office', quantity: 2, size: 20, floor: 1 }],
  }

  assert.equal(getRoomScheduledTaskExtraTotal(draft, config), 5.5)
})

test('a selected priced floor task replaces generic area labour for that room', () => {
  const roomType = {
    id: 'office', label: 'Office', defaultLabel: 'Office', tracksSize: true, defaultSize: 20,
    defaultMopping: false, scopeTasks: ['Vacuum floors'], scopeTaskMinutesPerSqm: [0.068], scopeTaskDefaults: [true],
    pricingAdjustmentPercent: 0, fixedPricePerVisit: 0, fields: [],
  }
  const config = { roomTypes: [roomType] }
  const room = { id: 'room-1', type: 'office', label: 'Office', quantity: 2, size: 20, floor: 1 }
  const draft = {
    status: 'draft', revisedInputs: baseInputs, roomItems: [room], moppingMinutesPerSqm: 0.24,
    pricingAdjustmentPercent: 0, targetPrice: '', finalPerVisit: '', scopeSummary: '', inclusions: '', exclusions: '', serviceCommentary: '',
  }
  const pricing = {
    ...DEFAULT_QUOTE_PRICING_CONFIG,
    settings: { ...DEFAULT_QUOTE_PRICING_CONFIG.settings, hourlyRate: 50, minimumInvoice: 0, rangeLow: 1, rangeHigh: 1 },
    multipliers: {
      ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers,
      premisesType: { ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers.premisesType, office: 1 },
      frequency: { ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers.frequency, weekly: 1 },
      city: { ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers.city, melbourne: 1 },
      timePreference: { ...DEFAULT_QUOTE_PRICING_CONFIG.multipliers.timePreference, business_hours: 1 },
    },
    items: DEFAULT_QUOTE_PRICING_CONFIG.items.map((item) => ({ ...item, active: false })),
  }

  assert.equal(deriveQuoteInputsFromRooms(draft, config).floorArea, 40)
  assert.equal(buildFirmQuotePreview(draft, pricing, config).calculatedLow, 2.27)

  const task = getRoomScopeTaskDefinitions(roomType)[0]
  assert.equal(buildFirmQuotePreview({
    ...draft,
    roomItems: [{ ...room, scopeTaskSelections: { [task.id]: false } }],
  }, pricing, config).calculatedLow, 5)
})

test('standard floor task minutes reproduce the supplied 12 sqm reference costs at $50 per hour', () => {
  const roomType = {
    id: 'office', label: 'Office', defaultLabel: 'Office', tracksSize: true, defaultSize: 12,
    defaultMopping: false, scopeTasks: ['Vacuum floor', 'Mop floor'],
    scopeTaskPrices: [0.25, 0.2],
    pricingAdjustmentPercent: 0, fixedPricePerVisit: 0, fields: [],
  }

  assert.equal(getRoomScopeTaskMinutesPerSqm(roomType, 0), 0.068)
  assert.equal(getRoomScopeTaskMinutesPerSqm(roomType, 1), 0.24)
  assert.equal(Math.round(getRoomScopeTaskEffectiveRate(roomType, 0, 50) * 12 * 100) / 100, 0.68)
  assert.equal(Math.round(getRoomScopeTaskEffectiveRate(roomType, 1, 50) * 12 * 100) / 100, 2.4)
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
  const selections = getDefaultRoomScopeTaskSelections(office)
  selections[getRoomScopeTaskDefinitions(office)[1].id] = false
  assert.deepEqual(getRoomScopeTaskSchedule(office, selections, true), [
    { label: 'Dust desks', cadence: 'weekly' },
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
    assert.equal(roomType.scopeTasks.some((task) => task.toLowerCase().includes('vacuum')), true, `${roomType.id} should include vacuuming`)
    assert.equal(roomType.scopeTasks.some((task) => task.toLowerCase().includes('cobweb')), true, `${roomType.id} should include cobweb removal`)
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

  const standard = ensureStandardRoomTasks({ ...legacyRoom, scopeTaskPrices: [1.25] })
  assert.equal(standard.scopeTasks.includes(DEFAULT_VACUUM_TASK), false, 'existing vacuum task should be reused')
  assert.equal(standard.scopeTasks.includes(DEFAULT_MONTHLY_COBWEB_TASK), true)
  assert.equal(standard.scopeTaskPrices[0], 1.25)
  assert.equal(ensureStandardRoomTasks(standard).scopeTasks.length, standard.scopeTasks.length)
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
