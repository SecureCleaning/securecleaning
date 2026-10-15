import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
const { appendSavedQuoteField } = await import('../src/lib/savedQuoteFields.ts')
const { getRoomTaskAmortizationFactor, getRoomTaskCadenceLabel } = await import('../src/lib/roomTypeConfig.ts')
const { getRoomMetricFieldExtra } = await import('../src/lib/quoteWorkflow.ts')
const { validWorkflowInput, getWorkflowInputError } = await import('../src/lib/securityInput.ts')
const field = { id:'bins', label:'Bins', inputType:'number', defaultValue:2, includedUnits:1, pricePerUnit:10, cadence:'alternate_days' }
test('repeated saved fields have independent values, descriptions and pricing', () => {
 const initial={id:'r',type:'reception',quantity:1,metrics:{bins:3},customMetricFields:[]}
 const first={...initial,...appendSavedQuoteField(initial,field,'saved_first')}
 const second={...first,...appendSavedQuoteField(first,field,'saved_second')}
 second.customMetricFields[1].label='Another bin'
 second.metrics.saved_second=5
 assert.equal(first.customMetricFields[0].label,'Bins')
 assert.equal(initial.customMetricFields.length,0)
 assert.equal(second.metrics.bins,3)
 assert.equal(getRoomMetricFieldExtra(second,second.customMetricFields[0],'weekly'),5)
 assert.equal(getRoomMetricFieldExtra(second,second.customMetricFields[1],'weekly'),20)
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[second]}}),true)
 assert.throws(()=>appendSavedQuoteField(second,field,'saved_first'))
 assert.throws(()=>appendSavedQuoteField({...initial,customMetricFields:Array(20).fill(field)},field,'saved_next'))
})
test('new cadences preserve labels and use agreed pricing', () => {
 for(const frequency of ['daily','weekly','fortnightly','monthly']) {
 assert.equal(getRoomTaskAmortizationFactor('as_needed',frequency),1)
 assert.equal(getRoomTaskAmortizationFactor('alternate_days',frequency),0.5)
 }
 assert.equal(getRoomTaskCadenceLabel('as_needed'),'As needed')
 assert.equal(getRoomTaskCadenceLabel('alternate_days'),'Alternate days')
})
test('workflow errors locate the rejected field without leaking its value', () => {
 const error=getWorkflowInputError({firmQuoteDraft:{roomItems:[{customMetricFields:[{...field,label:'x'.repeat(201)}]}]}})
 assert.match(error,/roomItems.1.customMetricFields.1.label/)
 assert.doesNotMatch(error,/xxxxx/)
 assert.equal(getWorkflowInputError({firmQuoteDraft:{roomItems:[]}}),null)
})

test('descriptive labels from the reported quote are accepted up to 200 characters', () => {
 for (const length of [80,86,95,200]) assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{customMetricFields:[{...field,label:'x'.repeat(length)}]}]}}),true)
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{customMetricFields:[{...field,label:'x'.repeat(201)}]}]}}),false)
})

test('save parsing and client scope retain long labels and new schedules', async () => {
 const { parseFirmQuoteDraft } = await import('../src/lib/quoteWorkflow.ts')
 const { buildClientScopeReport } = await import('../src/lib/scopeOfWorks.ts')
 const inputs={businessName:'Test',contactName:'Test',email:'test@example.com',phone:'0400000000',city:'sydney',suburb:'Test',postcode:'2000',premisesType:'office',floorArea:100,floors:1,flooringType:'mixed',frequency:'daily',timePreference:'business_hours',addOns:{bathrooms:0,kitchens:0,windows:0,consumables:false,highTouchDisinfection:false,carpetSteam:false}}
 const fields=[{...field,id:'saved_first',label:'a'.repeat(95)},{...field,id:'saved_second',label:'b'.repeat(86),cadence:'as_needed'}]
 const draft=parseFirmQuoteDraft({roomItems:[{id:'r',type:'reception',label:'Test room',quantity:1,size:10,floor:1,customMetricFields:fields,metrics:{saved_first:2,saved_second:3}}]},inputs)
 assert.equal(draft.roomItems[0].customMetricFields[0].label.length,95)
 assert.equal(draft.roomItems[0].customMetricFields[1].cadence,'as_needed')
 const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG } = await import('../src/lib/roomTypeConfig.ts')
 const report=JSON.stringify(buildClientScopeReport('TEST',inputs,{totalLow:90,totalHigh:100},draft,DEFAULT_QUOTE_ROOM_TYPE_CONFIG))
 assert.match(report,/Alternate days/)
 assert.match(report,/As needed/)
})
