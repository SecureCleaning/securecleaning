import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
const { DEFAULT_GLOBAL_ROOM_TASK_RATES, splitRoomMoppingTasks, getMoppingRate } = await import('../src/lib/roomTypeConfig.ts')
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const { createRoomItem, selectWorkflowRoomMoppingRate, createDefaultFirmQuoteDraft, parseFirmQuoteDraft, buildFirmQuotePreview, getRoomMoppingExtraTotal, getRoomPricingBreakdown } = await import('../src/lib/quoteWorkflow.ts')
const { buildClientScopeReport } = await import('../src/lib/scopeOfWorks.ts')
const { duplicateQuoteRoom } = await import('../src/lib/quoteRoomEditing.ts')
const heavy = 'global_task_123_heavy'
const inputs = { businessName:'Fixture', contactName:'Test', email:'test@example.com', phone:'0400000000',city:'melbourne',suburb:'Test',postcode:'3000',premisesType:'office',floorArea:10,floors:1,frequency:'weekly',timePreference:'business_hours',addOns:{bathrooms:0,kitchens:0,windows:0} }
function fixture() {
 const config = {globalTaskRates:[...structuredClone(DEFAULT_GLOBAL_ROOM_TASK_RATES),{code:heavy,label:'MoppingHeavy',pricingMode:'area',minutesPerSqm:0.35,pricePerRoom:0}],roomTypes:[{
  id:'bathroom',label:'Bathroom',defaultLabel:'Bathroom',tracksSize:false,defaultSize:10,defaultMopping:true,moppingCadence:'every_clean',scopeTasks:['Vacuum and Mop floors'],scopeTaskIds:['floor-task'],scopeTaskCadences:['every_clean'],scopeTaskDefaults:[true],scopeTaskPrices:[0],scopeTaskMinutesPerSqm:[0.308],scopeTaskPricingModes:['area'],scopeTaskGlobalRateCodes:[null],pricingAdjustmentPercent:0,fixedPricePerVisit:0,fields:[],
 }]}
 const room={...createRoomItem('bathroom',config),moppingRateCode:heavy,moppingMinutesPerSqm:0.35}
 const draft={...createDefaultFirmQuoteDraft(inputs,config),roomItems:[room]}
 const pricing={...DEFAULT_QUOTE_PRICING_CONFIG,settings:{...DEFAULT_QUOTE_PRICING_CONFIG.settings,minimumInvoice:0,hourlyRate:50},items:[]}
 return {config,room,draft,pricing}
}
function scope(f) {const preview=buildFirmQuotePreview(f.draft,f.pricing,f.config);return buildClientScopeReport('TEST',inputs,preview.calculated,f.draft,f.config,null,null,preview)}
test('heavy replaces standard mopping once, preserving separate vacuum price and scope for a bathroom without track sqm',()=>{
 const f=fixture();const preview=buildFirmQuotePreview(f.draft,f.pricing,f.config)
 assert.equal(preview.scheduledTaskExtraTotal,3.48)
 assert.equal(preview.calculatedLow,3.48)
 assert.equal(getRoomMoppingExtraTotal(f.draft,f.pricing,f.config),0)
 assert.equal(getRoomPricingBreakdown(f.draft,f.pricing,f.config)[f.room.id].low,3.48)
 assert.deepEqual(scope(f).rooms[0].tasks.map(t=>t.label),['Vacuum accessible floor areas','MoppingHeavy'])
 f.room.moppingRateCode='mopping'
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,2.57)
 assert.deepEqual(scope(f).rooms[0].tasks.map(t=>t.label),['Vacuum accessible floor areas','Mopping'])
 f.room.moppingEnabled=false
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,0.57)
 assert.deepEqual(scope(f).rooms[0].tasks.map(t=>t.label),['Vacuum accessible floor areas'])
})
test('vacuum selection, room quantities and weekly mopping cadence remain independent',()=>{
 const f=fixture();f.room.quantity=2;f.config.roomTypes[0].moppingCadence='weekly';f.draft.revisedInputs.frequency='daily'
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,2.3)
 f.room.scopeTaskSelections={'floor-task':false}
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,1.17)
 assert.deepEqual(scope(f).rooms[0].tasks.map(t=>t.label),['MoppingHeavy'])
 f.room.size=0
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).scheduledTaskExtraTotal,0)
})
test('room defaults and per-quote overrides roundtrip, duplicate independently and do not change legacy rooms to heavy',()=>{
 const f=fixture();const original=f.config.roomTypes[0]
 f.config.roomTypes[0]={...splitRoomMoppingTasks(f.config,original,heavy),moppingRateCode:heavy,moppingMinutesPerSqm:0.35}
 assert.equal(createRoomItem('bathroom',f.config).moppingRateCode,heavy)
 let parsed=parseFirmQuoteDraft(JSON.parse(JSON.stringify(f.draft)),inputs,f.config)
 assert.equal(parsed.roomItems[0].moppingRateCode,heavy)
 assert.equal(buildFirmQuotePreview(parsed,f.pricing,f.config).calculatedLow,3.48)
 const copied=duplicateQuoteRoom(parsed.roomItems,parsed.roomItems[0].id,'duplicate')
 assert.equal(copied[1].moppingRateCode,heavy)
 copied[1].moppingRateCode='mopping'
 assert.equal(copied[0].moppingRateCode,heavy)
 delete f.room.moppingRateCode
 parsed=parseFirmQuoteDraft(JSON.parse(JSON.stringify(f.draft)),inputs,f.config)
 assert.equal(parsed.roomItems[0].moppingRateCode,undefined)
 assert.equal(buildFirmQuotePreview(parsed,f.pricing,f.config).calculatedLow,2.57)
})
test('renamed or retired heavy sources keep identity and never silently fall back to standard',()=>{
 const f=fixture();f.config.globalTaskRates.find(r=>r.code===heavy).label='Detailed floor wash'
 assert.equal(scope(f).rooms[0].tasks[1].label,'Detailed floor wash')
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,3.48)
 f.config.globalTaskRates=f.config.globalTaskRates.filter(r=>r.code!==heavy)
 assert.equal(getMoppingRate(f.config,heavy,0.35).available,false)
 const parsed=parseFirmQuoteDraft(JSON.parse(JSON.stringify(f.draft)),inputs,f.config)
 assert.equal(parsed.roomItems[0].moppingRateCode,heavy)
 assert.equal(parsed.roomItems[0].moppingMinutesPerSqm,0.35)
 assert.equal(buildFirmQuotePreview(parsed,f.pricing,f.config).calculatedLow,3.48)
})
test('an already linked heavy task is not charged again by the mopping selector',()=>{
 const f=fixture();const type=f.config.roomTypes[0]
 for (const [key,value] of Object.entries({scopeTasks:'Heavy floor care',scopeTaskIds:'extra-heavy',scopeTaskCadences:'every_clean',scopeTaskDefaults:true,scopeTaskPrices:0,scopeTaskMinutesPerSqm:0.35,scopeTaskPricingModes:'area',scopeTaskGlobalRateCodes:heavy})) type[key].push(value)
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,3.48)
 assert.equal(scope(f).rooms[0].tasks.length,2)
 f.draft.roomItems[0]=selectWorkflowRoomMoppingRate(f.room,f.config,'mopping')
 assert.equal(buildFirmQuotePreview(f.draft,f.pricing,f.config).calculatedLow,2.57)
 assert.deepEqual(scope(f).rooms[0].tasks.map(t=>t.label),['Vacuum accessible floor areas','Mopping'])
})
test('settings JSON normalization and storage retain the chosen source and saved fallback rate', async (t)=>{
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role'
 const {saveQuoteRoomTypeConfig,getQuoteRoomTypeConfig}=await import('../src/lib/roomTypeConfig.ts')
 const f=fixture();f.config.roomTypes[0]={...splitRoomMoppingTasks(f.config,f.config.roomTypes[0],heavy),moppingRateCode:heavy,moppingMinutesPerSqm:0.35}
 let stored
 t.mock.method(globalThis,'fetch',async (_url,options)=>{
  if (options?.method==='POST') {stored=JSON.parse(options.body).content;return new Response(null,{status:201})}
  return new Response(JSON.stringify([{content:stored}]),{status:200,headers:{'Content-Type':'application/json'}})
 })
 const saved=await saveQuoteRoomTypeConfig(f.config)
 const loaded=await getQuoteRoomTypeConfig()
 for (const config of [saved,loaded]) {
  const room=config.roomTypes.find(r=>r.id==='bathroom')
  assert.equal(room.moppingRateCode,heavy)
  assert.equal(room.moppingMinutesPerSqm,0.35)
  assert.ok(!room.scopeTasks.includes('Vacuum and Mop floors'))
 }
})
