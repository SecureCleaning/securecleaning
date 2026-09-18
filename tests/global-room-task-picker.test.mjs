import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
const { addGlobalRoomScopeTask, applyGlobalRoomTaskRates, DEFAULT_QUOTE_ROOM_TYPE_CONFIG, getMatchedGlobalRoomTaskRates } = await import('../src/lib/roomTypeConfig.ts')
function fixture() {
  const config = structuredClone(DEFAULT_QUOTE_ROOM_TYPE_CONFIG)
  config.globalTaskRates.push({ code: 'mwo', label: 'MWO', pricingMode: 'fixed', minutesPerSqm: 0, pricePerRoom: 1.5 })
  return applyGlobalRoomTaskRates(config)
}
test('global picker adds a selected default with stable identity and preserves every existing task setting', () => {
  const before = fixture()
  const room = before.roomTypes[0]
  const after = addGlobalRoomScopeTask(before, room.id, 'mwo')
  const updated = after.roomTypes[0]
  const index = updated.scopeTasks.length - 1
  for (const key of ['scopeTasks', 'scopeTaskIds', 'scopeTaskCadences', 'scopeTaskPrices', 'scopeTaskMinutesPerSqm', 'scopeTaskPricingModes', 'scopeTaskGlobalRateCodes', 'scopeTaskDefaults']) {
    assert.deepEqual(updated[key].slice(0, index), room[key], key)
    assert.equal(updated[key].length, updated.scopeTasks.length, key)
  }
  assert.equal(updated.scopeTasks[index], 'MWO')
  assert.equal(updated.scopeTaskGlobalRateCodes[index], 'mwo')
  assert.equal(updated.scopeTaskDefaults[index], true)
  assert.equal(updated.scopeTaskPrices[index], 1.5)
  assert.deepEqual(addGlobalRoomScopeTask(after, room.id, 'mwo'), after)
  assert.deepEqual(addGlobalRoomScopeTask(after, room.id, 'missing'), after)
  assert.deepEqual(before, fixture())
})
test('explicit global binding survives rename and JSON save/reload and follows global rate updates', () => {
  let config = fixture()
  config = addGlobalRoomScopeTask(config, config.roomTypes[0].id, 'mwo')
  let room = config.roomTypes[0]
  const index = room.scopeTasks.length - 1
  const id = room.scopeTaskIds[index]
  room.scopeTasks[index] = 'Vacuum or mop microwave exterior'
  config.globalTaskRates.find(rate => rate.code === 'mwo').pricePerRoom = 3.25
  config = applyGlobalRoomTaskRates(JSON.parse(JSON.stringify(config)))
  room = config.roomTypes[0]
  assert.equal(room.scopeTaskIds[index], id)
  assert.equal(room.scopeTaskPrices[index], 3.25)
  assert.equal(room.scopeTaskPricingModes[index], 'fixed')
  assert.deepEqual(getMatchedGlobalRoomTaskRates(config, room, index).map(rate => rate.code), ['mwo'])
  config.globalTaskRates = config.globalTaskRates.filter(rate => rate.code !== 'mwo')
  config = applyGlobalRoomTaskRates(config)
  assert.equal(config.roomTypes[0].scopeTaskPrices[index], 3.25)
  assert.deepEqual(getMatchedGlobalRoomTaskRates(config, config.roomTypes[0], index), [])
})
test('renamed explicitly linked standard tasks retain cadence and do not create duplicate defaults', () => {
  let config = fixture()
  const room = config.roomTypes[0]
  for (const code of ['vacuum_sweep', 'dusting', 'cobwebs']) {
    const index = room.scopeTasks.findIndex((_, i) => getMatchedGlobalRoomTaskRates(config, room, i).some(rate => rate.code === code))
    assert.ok(index >= 0)
    room.scopeTaskGlobalRateCodes[index] = code
    room.scopeTasks[index] = `Renamed ${index}`
    room.scopeTaskCadences[index] = 'quarterly'
  }
  const count = room.scopeTasks.length
  config = applyGlobalRoomTaskRates(config)
  assert.equal(config.roomTypes[0].scopeTasks.length, count)
  for (const code of ['vacuum_sweep', 'dusting', 'cobwebs']) {
    const index = config.roomTypes[0].scopeTaskGlobalRateCodes.indexOf(code)
    assert.equal(config.roomTypes[0].scopeTaskCadences[index], 'quarterly')
    assert.deepEqual(addGlobalRoomScopeTask(config, room.id, code), config)
  }
})

test('renamed explicit mopping is charged once, and another source with mop wording does not suppress mopping', async () => {
  const { getRoomMoppingExtraTotal, getRoomPricingBreakdown } = await import('../src/lib/quoteWorkflow.ts')
  const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
  let config = fixture()
  const room = config.roomTypes[0]
  const index = room.scopeTasks.findIndex((_, i) => getMatchedGlobalRoomTaskRates(config, room, i).some(rate => rate.code === 'mopping'))
  assert.ok(index >= 0)
  room.scopeTaskGlobalRateCodes[index] = 'mopping'
  room.scopeTasks[index] = 'Wash hard flooring'
  room.scopeTaskDefaults[index] = true
  config = applyGlobalRoomTaskRates(config)
  const draft = {
    revisedInputs: { frequency: 'weekly', floorArea: 12, floors: 1, premisesType: 'office', city: 'melbourne', timePreference: 'business_hours', addOns: {} }, pricingAdjustmentPercent: 0,
    roomItems: [{id:'room-1', type:room.id, label:'Office', quantity:1, size:12, floor:1, moppingEnabled:true}],
  }
  assert.equal(getRoomMoppingExtraTotal(draft, DEFAULT_QUOTE_PRICING_CONFIG, config), 0)
  const enabled = getRoomPricingBreakdown(draft, DEFAULT_QUOTE_PRICING_CONFIG, config)
  const disabled = getRoomPricingBreakdown({...draft,roomItems:[{...draft.roomItems[0],moppingEnabled:false}]}, DEFAULT_QUOTE_PRICING_CONFIG, config)
  assert.ok(Number.isFinite(enabled['room-1'].low))
  assert.deepEqual(enabled, disabled)
  config.roomTypes[0].scopeTaskGlobalRateCodes[index] = 'vacuum_sweep'
  config.roomTypes[0].scopeTasks[index] = 'Mop-looking task name'
  config = applyGlobalRoomTaskRates(config)
  assert.ok(getRoomMoppingExtraTotal(draft, DEFAULT_QUOTE_PRICING_CONFIG, config) > 0)
})
