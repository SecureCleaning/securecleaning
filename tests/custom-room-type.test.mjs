import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test'
const {validWorkflowInput}=await import('../src/lib/securityInput.ts')
const {parseFirmQuoteDraft}=await import('../src/lib/quoteWorkflow.ts')
const {DEFAULT_QUOTE_ROOM_TYPE_CONFIG}=await import('../src/lib/roomTypeConfig.ts')
test('configured room types survive validation and quote reload',()=>{
 const custom={...DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes[0],id:'room_type_1792200000000',label:'Restaurant',defaultLabel:'Restaurant',scopeTasks:['Wipe tables'],scopeTaskIds:['restaurant-tables']}
 const config={...DEFAULT_QUOTE_ROOM_TYPE_CONFIG,roomTypes:[...DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes,custom]}
 const room={id:'r',type:custom.id,label:'Restaurant',quantity:1,size:119,floor:1,scopeTaskSelections:{'restaurant-tables':false}}
 const draft={roomItems:[room]}
 assert.equal(validWorkflowInput({firmQuoteDraft:draft}),true)
 const inputs={premisesType:'office',floorArea:100,frequency:'weekly',addOns:{},roomScope:[]}
 const loaded=parseFirmQuoteDraft(draft,inputs,config)
 assert.equal(loaded.roomItems[0].type,custom.id)
 assert.equal(loaded.roomItems[0].scopeTaskSelections['restaurant-tables'],false)
 assert.equal(parseFirmQuoteDraft(draft,inputs).roomItems[0].type,'other')
})
test('room identifiers stay bounded and exclude unsafe keys',()=>{
 for(const type of ['', 'x'.repeat(129),'bad\nkey','__proto__','constructor','prototype',123])
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{type}]}}),false)
})
