import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test'
const {validWorkflowInput}=await import('../src/lib/securityInput.ts')
const {getWorkflowRoomTypeConfig,parseFirmQuoteDraft,getRoomScheduledTaskExtraTotal}=await import('../src/lib/quoteWorkflow.ts')
const {DEFAULT_QUOTE_ROOM_TYPE_CONFIG,getRoomScopeTaskId,getRoomScopeTaskCadence}=await import('../src/lib/roomTypeConfig.ts')
test('quote-specific task cadence survives save parsing and changes price without changing defaults',()=>{
 const base={...DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes[0],scopeTasks:['Wipe tables'],scopeTaskIds:['wipe'],scopeTaskCadences:['every_clean'],scopeTaskPrices:[10],scopeTaskPricingModes:['fixed'],scopeTaskDefaults:[true],scopeTaskMinutesPerSqm:[0]}
 const config={...DEFAULT_QUOTE_ROOM_TYPE_CONFIG,roomTypes:[base]}
 const id=getRoomScopeTaskId(base,0)
 const room={id:'r',type:base.id,label:'Office',quantity:1,size:10,floor:1,scopeTaskSelections:{[id]:true},scopeTaskCadences:{[id]:'alternate_days'}}
 const draft={roomItems:[room],revisedInputs:{premisesType:'office',floorArea:10,frequency:'weekly',addOns:{},roomScope:[]}}
 assert.equal(validWorkflowInput({firmQuoteDraft:draft}),true)
 const loaded=parseFirmQuoteDraft(draft,draft.revisedInputs,config)
 assert.equal(loaded.roomItems[0].scopeTaskCadences[id],'alternate_days')
 assert.equal(getRoomScopeTaskCadence(getWorkflowRoomTypeConfig(loaded.roomItems[0],config),0),'alternate_days')
 assert.equal(getRoomScopeTaskCadence(base,0),'every_clean')
 const half=getRoomScheduledTaskExtraTotal(loaded,config)
 const full=getRoomScheduledTaskExtraTotal({...loaded,roomItems:[{...loaded.roomItems[0],scopeTaskCadences:{[id]:'as_needed'}}]},config)
 assert.ok(full>0)
 assert.equal(half,full/2)
})
test('invalid task cadences and unsafe keys are rejected',()=>{
 for(const scopeTaskCadences of [{task:'sometimes'},JSON.parse('{"__proto__":"weekly"}'),{task:3}])
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{scopeTaskCadences}]}}),false)
})
