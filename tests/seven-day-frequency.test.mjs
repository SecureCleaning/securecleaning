import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test'
process.env.SUPABASE_SERVICE_ROLE_KEY='test'
const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG, getRoomTaskAmortizationFactor } = await import('../src/lib/roomTypeConfig.ts')
const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
const { createDefaultFirmQuoteDraft, createRoomItem, parseFirmQuoteDraft, getWorkflowRoomTypeConfig, getRoomTaskContribution, getRoomScheduledTaskExtraTotal, getRoomPricingBreakdown } = await import('../src/lib/quoteWorkflow.ts')
const { getDefaultAnnualVisits } = await import('../src/lib/contractProductPolicy.ts')
const { validWorkflowInput } = await import('../src/lib/securityInput.ts')
import { readFileSync } from 'node:fs'

const inputs = { businessName:'Test', contactName:'Test', email:'test@example.com', phone:'0400000000',city:'melbourne',suburb:'Test',postcode:'3000',premisesType:'office',floorArea:100,floors:1,frequency:'7x_week',timePreference:'business_hours',addOns:{bathrooms:0,kitchens:0,windows:0} }
function fixture() {
 const config = { ...DEFAULT_QUOTE_ROOM_TYPE_CONFIG, globalTaskRates:[], roomTypes:[{
  id:'office',label:'Office',defaultLabel:'Office',tracksSize:true,defaultSize:100,defaultMopping:false,
  scopeTasks:['Weekly fixture','Monthly fixture'],scopeTaskIds:['weekly-task','monthly-task'],
  scopeTaskCadences:['weekly','monthly'],scopeTaskDefaults:[true,true],scopeTaskPrices:[0.75,0],
  scopeTaskMinutesPerSqm:[0,0.09],scopeTaskPricingModes:['fixed','area'],scopeTaskGlobalRateCodes:[null,null],
  pricingAdjustmentPercent:0,fixedPricePerVisit:0,fields:[],
 }] }
 const room=createRoomItem('office',config)
 const draft={...createDefaultFirmQuoteDraft(inputs,config),roomItems:[room]}
 const pricing={...DEFAULT_QUOTE_PRICING_CONFIG,settings:{...DEFAULT_QUOTE_PRICING_CONFIG.settings,hourlyRate:50,minimumInvoice:0},items:[]}
 return {config,room,draft,pricing}
}
test('7-day amortisation uses 52 weeks and 12 months without changing existing daily',()=>{
 assert.equal(getDefaultAnnualVisits('7x_week'),364)
 assert.equal(getDefaultAnnualVisits('daily'),260)
 assert.equal(getRoomTaskAmortizationFactor('weekly','7x_week'),1/7)
 assert.equal(getRoomTaskAmortizationFactor('monthly','7x_week'),12/364)
 assert.equal(getRoomTaskAmortizationFactor('weekly','daily'),1/5)
 assert.equal(getRoomTaskAmortizationFactor('as_needed','7x_week'),1)
 assert.equal(getRoomTaskAmortizationFactor('alternate_days','7x_week'),0.5)
})
test('display contribution and room pricing share quantity, selection, cadence and area maths',()=>{
 const {config,room,draft,pricing}=fixture()
 room.quantity=2
 const type=getWorkflowRoomTypeConfig(room,config)
 const weekly=getRoomTaskContribution(room,type,0,'7x_week',50,200)
 const monthly=getRoomTaskContribution(room,type,1,'7x_week',50,200)
 assert.ok(Math.abs(weekly*7-1.50)<1e-10)
 assert.ok(Math.abs(monthly*364-15*12)<1e-10)
 const rounded=Math.round((weekly+monthly)*100)/100
 assert.equal(getRoomScheduledTaskExtraTotal(draft,config,50),rounded)
 assert.equal(getRoomPricingBreakdown(draft,pricing,config)[room.id].low,rounded)
 room.scopeTaskSelections={'weekly-task':false,'monthly-task':true}
 assert.equal(getRoomTaskContribution(room,type,0,'7x_week',50,200),0)
 room.scopeTaskCadences={'monthly-task':'weekly'}
 const changed=getWorkflowRoomTypeConfig(room,config)
 assert.ok(Math.abs(getRoomTaskContribution(room,changed,1,'7x_week',50,200)*7-15)<1e-10)
})
test('seven-day workflow validates and roundtrips without falling back to another schedule',()=>{
 const {config,draft}=fixture()
 assert.equal(validWorkflowInput(JSON.parse(JSON.stringify({firmQuoteDraft:draft}))),true)
 assert.equal(parseFirmQuoteDraft(draft,inputs,config).revisedInputs.frequency,'7x_week')
 assert.equal(validWorkflowInput({firmQuoteDraft:{revisedInputs:{frequency:'8x_week'}}}),false)
})
test('database migration preserves both protected product RPCs and adds 364-visit mapping',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261020043531_seven_day_cleaning_frequency.sql',import.meta.url),'utf8')
 assert.match(sql,/ALTER TYPE public.cleaning_frequency ADD VALUE IF NOT EXISTS '7x_week'/)
 assert.equal((sql.match(/WHEN '7x_week' THEN 364/g)||[]).length,2)
 assert.match(sql,/actor not authorized/)
 assert.match(sql,/opportunity not assigned to agent/)
 assert.match(sql,/Winning quote changed or unavailable/)
 assert.match(sql,/refresh_contract_product_cleaner_scope/)
 assert.equal((sql.match(/FROM PUBLIC,anon,authenticated/g)||[]).length,2)
})
