import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic'
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const { DEFAULT_GLOBAL_ROOM_TASK_RATES } = await import('../src/lib/roomTypeConfig.ts')
const { buildFirmQuotePreview, createDefaultFirmQuoteDraft, createRoomItem, parseFirmQuoteDraft, reviewCleaningMultipliers, getCleaningSubtotalMultiplier, getRoomPricingBreakdown, getRoomMoppingContribution, getFirmQuoteDisplayPrice } = await import('../src/lib/quoteWorkflow.ts')
const { validWorkflowInput } = await import('../src/lib/securityInput.ts')
const { refreshQuotePrices } = await import('../src/lib/refreshQuotePrices.ts')

function fixture() {
  const inputs = { businessName:'Fixture',contactName:'Test',email:'test@example.com',phone:'0400000000',city:'sydney',premisesType:'childcare',floorArea:200,floors:1,frequency:'2x_week',timePreference:'after_hours',addOns:{bathrooms:0,kitchens:0,windows:0,consumables:true,highTouchDisinfection:true} }
  const config = { globalTaskRates:structuredClone(DEFAULT_GLOBAL_ROOM_TASK_RATES),roomTypes:[{
    id:'office',label:'Office',defaultLabel:'Room',tracksSize:true,defaultSize:100,defaultMopping:true,moppingCadence:'every_clean',
    scopeTasks:['Vacuum floors','Wipe surfaces'],scopeTaskIds:['vacuum','fixed'],scopeTaskCadences:['every_clean','weekly'],scopeTaskDefaults:[true,true],scopeTaskPrices:[0,10],scopeTaskMinutesPerSqm:[0.06,0],scopeTaskPricingModes:['area','fixed'],scopeTaskGlobalRateCodes:[null,null],pricingAdjustmentPercent:0,fixedPricePerVisit:0,
    fields:[{id:'extra',label:'Additional cleaning',inputType:'number',defaultValue:0,includedUnits:1,pricePerUnit:3,cadence:'every_clean'}],
  }] }
  const room={...createRoomItem('office',config),quantity:2,size:100,moppingEnabled:true,moppingRateCode:'mopping',moppingMinutesPerSqm:0.24,metrics:{extra:4},scopeTaskQuantities:{fixed:3},pricingOverride:true,fixedPricePerVisit:7,pricingAdjustmentPercent:0}
  const draft={...createDefaultFirmQuoteDraft(inputs,config),roomItems:[room]}
  const pricing=structuredClone(DEFAULT_QUOTE_PRICING_CONFIG)
  Object.assign(pricing.settings,{minimumInvoice:0,hourlyRate:50,rangeLow:1,rangeHigh:1})
  pricing.multipliers.premisesType.childcare=1.1;pricing.multipliers.frequency['2x_week']=1.2
  pricing.multipliers.city.sydney=1;pricing.multipliers.timePreference.after_hours=1
  pricing.items=[{id:'supplies',code:'consumables',rate:25,active:true,unitType:'fixed',name:'Supplies'},{id:'disinfection',code:'highTouchDisinfection',rate:0.1,active:true,unitType:'sqm',name:'Disinfection'}]
  return {draft,pricing,config,room,inputs}
}

test('whole subtotal compounds building and frequency across tasks, mopping, extras, fixed room charges and cleaning add-ons, excluding supplies',()=>{
  const f=fixture();const original=JSON.stringify(f.draft)
  assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,157)
  const reviewed=reviewCleaningMultipliers(f.draft,f.pricing)
  const p=buildFirmQuotePreview(reviewed,f.pricing,f.config)
  assert.equal(getCleaningSubtotalMultiplier(reviewed),1.32)
  assert.deepEqual(p.cleaningMultiplierBreakdown,{beforeLow:132,beforeHigh:132,afterLow:174.24,afterHigh:174.24,building:1.1,frequency:1.2})
  assert.equal(p.calculatedLow,199.24)
  assert.equal(p.scheduledTaskExtraTotal,105.6)
  assert.equal(p.roomFieldExtraTotal,23.76)
  assert.equal(p.roomPricingExtraLow,18.48)
  assert.ok(Math.abs(getRoomMoppingContribution(f.room,reviewed,f.pricing,f.config)-52.8)<1e-9)
  assert.equal(getRoomPricingBreakdown(reviewed,f.pricing,f.config)[f.room.id].low,147.84)
  assert.equal(p.calculated.totalLow,p.adjustedLow)
  assert.equal(JSON.stringify(f.draft),original,'review must not mutate or apply to the saved draft')
  assert.equal(parseFirmQuoteDraft(f.draft,f.inputs,f.config).cleaningMultipliers,undefined)
  assert.equal(buildFirmQuotePreview(parseFirmQuoteDraft(f.draft,f.inputs,f.config),f.pricing,f.config).calculatedLow,157)
})

test('general labour and room percentage receive the factors once, including spring range',()=>{
  const f=fixture();f.room.moppingEnabled=false;f.room.scopeTaskSelections={vacuum:false,fixed:false};f.room.metrics={extra:0};f.room.quantity=1;f.room.fixedPricePerVisit=0;f.room.pricingAdjustmentPercent=20;f.draft.revisedInputs.addOns={bathrooms:0,kitchens:0,windows:0}
  const reviewed=reviewCleaningMultipliers(f.draft,f.pricing)
  // 100sqm / 400 * $50 = $12.50; 20% room adjustment = $2.50; x1.32 once = $19.80.
  assert.equal(buildFirmQuotePreview(reviewed,f.pricing,f.config).calculatedLow,19.8)
  assert.equal(getRoomPricingBreakdown(reviewed,f.pricing,f.config)[f.room.id].low,19.8)
  reviewed.revisedInputs={...reviewed.revisedInputs,isSpringClean:true}
  assert.equal(buildFirmQuotePreview(reviewed,f.pricing,f.config).calculatedLow,39.6)
  assert.equal(getRoomPricingBreakdown(reviewed,f.pricing,f.config)[f.room.id].low,39.6)
  assert.equal(getRoomPricingBreakdown(reviewed,f.pricing,f.config)[f.room.id].high,59.4)
})

test('snapshot roundtrips, ignores later defaults, refresh preserves it and a changed selection requires explicit new review',()=>{
  const f=fixture();const reviewed=reviewCleaningMultipliers(f.draft,f.pricing)
  assert.equal(validWorkflowInput({firmQuoteDraft:reviewed}),true)
  const parsed=parseFirmQuoteDraft(JSON.parse(JSON.stringify(reviewed)),f.inputs,f.config)
  assert.deepEqual(parsed.cleaningMultipliers,reviewed.cleaningMultipliers)
  const changed=structuredClone(f.pricing);changed.multipliers.premisesType.childcare=2;changed.multipliers.frequency['2x_week']=3
  assert.equal(buildFirmQuotePreview(parsed,changed,f.config).calculatedLow,199.24)
  assert.equal(buildFirmQuotePreview(reviewCleaningMultipliers(parsed,changed),changed,f.config).calculatedLow,817)
  for(const replace of [false,true]) assert.deepEqual(refreshQuotePrices(parsed,f.config,replace).draft.cleaningMultipliers,reviewed.cleaningMultipliers)
  parsed.revisedInputs.premisesType='office'
  assert.equal(getCleaningSubtotalMultiplier(parsed),1.32)
  assert.equal(reviewCleaningMultipliers(parsed,f.pricing).cleaningMultipliers.building,1)
})

test('invalid and incomplete multiplier metadata is rejected at save boundary and safe when parsing stored legacy JSON',()=>{
  const f=fixture();const snapshot=reviewCleaningMultipliers(f.draft,f.pricing).cleaningMultipliers
  const invalid=[{},null,{...snapshot,version:2},{...snapshot,building:0},{...snapshot,building:101},{...snapshot,frequencyFactor:NaN},{...snapshot,frequencyFactor:Infinity},{...snapshot,frequency:'bad'},{...snapshot,premisesType:'bad'}]
  for(const value of invalid){
    assert.equal(validWorkflowInput({firmQuoteDraft:{cleaningMultipliers:value}}),false)
    assert.equal(parseFirmQuoteDraft({...f.draft,cleaningMultipliers:value},f.inputs,f.config).cleaningMultipliers,undefined)
  }
})

test('quote adjustment, minimum and final/target overrides retain their order, mopping off contributes zero',()=>{
  const f=fixture();const reviewed=reviewCleaningMultipliers(f.draft,f.pricing)
  reviewed.pricingAdjustmentPercent=10;reviewed.finalPerVisit='300'
  const p=buildFirmQuotePreview(reviewed,f.pricing,f.config)
  assert.equal(p.calculatedLow,219.16)
  assert.equal(getFirmQuoteDisplayPrice(reviewed,p).low,300)
  reviewed.finalPerVisit='';reviewed.targetPrice='250'
  assert.equal(getFirmQuoteDisplayPrice(reviewed,p).low,250)
  f.pricing.settings.minimumInvoice=200
  assert.equal(buildFirmQuotePreview(reviewed,f.pricing,f.config).adjustedLow,240)
  assert.equal(getRoomMoppingContribution({...f.room,moppingEnabled:false},reviewed,f.pricing,f.config),0)
})

test('all building types and all supported frequencies can be reviewed including once-off x4',()=>{
  const f=fixture()
  f.pricing.multipliers.frequency.once_off=4
  for(const premisesType of Object.keys(f.pricing.multipliers.premisesType)) for(const frequency of Object.keys(f.pricing.multipliers.frequency)) {
    const draft={...f.draft,revisedInputs:{...f.draft.revisedInputs,premisesType,frequency}}
    const reviewed=reviewCleaningMultipliers(draft,f.pricing)
    assert.equal(getCleaningSubtotalMultiplier(reviewed),f.pricing.multipliers.premisesType[premisesType]*f.pricing.multipliers.frequency[frequency])
    assert.ok(Number.isFinite(buildFirmQuotePreview(reviewed,f.pricing,f.config).adjustedLow))
  }
})
