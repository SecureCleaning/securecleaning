import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
const { parseFirmQuoteDraft, getWorkflowRoomTypeConfig, getRoomTaskContribution } = await import('../src/lib/quoteWorkflow.ts')
const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG, getRoomScopeTaskDefinitions } = await import('../src/lib/roomTypeConfig.ts')
const { validWorkflowInput } = await import('../src/lib/securityInput.ts')
const { buildClientScopeReport } = await import('../src/lib/scopeOfWorks.ts')
const inputs = { businessName:'Test',contactName:'Test',email:'test@example.com',phone:'0400000000',city:'sydney',suburb:'Test',postcode:'2000',premisesType:'office',floorArea:100,floors:1,flooringType:'mixed',frequency:'weekly',timePreference:'business_hours',addOns:{bathrooms:0,kitchens:0,windows:0,consumables:false,highTouchDisinfection:false,carpetSteam:false} }
const baseRoom = { id:'r',type:'reception',label:'Reception',quantity:2,size:10,floor:1 }
const config = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
const defaults = getRoomScopeTaskDefinitions(getWorkflowRoomTypeConfig(baseRoom,config))
const custom = { id:'quote-task-test', label:'Clean special cabinet',price:7,minutesPerSqm:0,pricingMode:'fixed',defaultSelected:true,cadence:'every_clean' }
test('quote tasks retain wording, prices, removals and selection through reload without altering defaults', () => {
 const before = JSON.stringify(config)
 const edited = {...defaults[0],label:'Custom wording for reception',price:3,pricingMode:'fixed',defaultSelected:true}
 const room = {...baseRoom,quoteTasks:[edited,custom],excludedTaskIds:[defaults[1].id],scopeTaskSelections:{[edited.id]:true,[custom.id]:false}}
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[room]}}),true)
 const draft = parseFirmQuoteDraft({roomItems:[room]},inputs,config)
 const reloaded = parseFirmQuoteDraft(JSON.parse(JSON.stringify(draft)),inputs,config)
 const saved = reloaded.roomItems[0]
 const type = getWorkflowRoomTypeConfig(saved,config)
 const tasks = getRoomScopeTaskDefinitions(type)
 assert.equal(tasks.find(t=>t.id===edited.id).label,edited.label)
 assert.equal(tasks.some(t=>t.id===defaults[1].id),false)
 assert.equal(getRoomTaskContribution(saved,type,tasks.findIndex(t=>t.id===edited.id),'weekly',60,20),6)
 assert.equal(getRoomTaskContribution(saved,type,tasks.findIndex(t=>t.id===custom.id),'weekly',60,20),0)
 saved.scopeTaskSelections[custom.id]=true
 assert.equal(getRoomTaskContribution(saved,type,tasks.findIndex(t=>t.id===custom.id),'weekly',60,20),14)
 const report=JSON.stringify(buildClientScopeReport('TEST',inputs,{totalLow:90,totalHigh:100},reloaded,config))
 assert.ok(report.includes(edited.label))
 assert.ok(report.includes(custom.label))
 assert.equal(JSON.stringify(config),before)
})
test('custom area task uses saved minutes and cadence',()=>{
 const room={...baseRoom,quoteTasks:[{...custom,pricingMode:'area',minutesPerSqm:0.5}]}
 const saved=parseFirmQuoteDraft({roomItems:[room]},inputs,config).roomItems[0]
 const type=getWorkflowRoomTypeConfig(saved,config)
 const index=type.scopeTaskIds.indexOf(custom.id)
 assert.equal(getRoomTaskContribution(saved,type,index,'weekly',60,20),10)
})
test('task editing rejects invalid or unbounded payloads',()=>{
 for(const task of [{...custom,price:-1},{...custom,minutesPerSqm:Infinity},{...custom,label:''},{...custom,label:'x'.repeat(201)},{...custom,pricingMode:'unknown'},{id:'only-id'}]) {
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{...baseRoom,quoteTasks:[task]}]}}),false)
 }
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{...baseRoom,quoteTasks:Array(101).fill(custom)}]}}),false)
})

test('task quantity defaults to one and persists independently per room with pricing and client scope',()=>{
 const task={...custom,price:0.7}
 const room={...baseRoom,quantity:1,quoteTasks:[task]}
 const original=getWorkflowRoomTypeConfig(room,config)
 const index=original.scopeTaskIds.indexOf(task.id)
 assert.equal(getRoomTaskContribution(room,original,index,'weekly',60,10),0.7)
 const changed={...room,scopeTaskQuantities:{[task.id]:3}}
 assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[changed]}}),true)
 const draft=parseFirmQuoteDraft({roomItems:[changed,{...room,id:'second-room'}]},inputs,config)
 const saved=parseFirmQuoteDraft(JSON.parse(JSON.stringify(draft)),inputs,config)
 const first=saved.roomItems[0]
 const type=getWorkflowRoomTypeConfig(first,config)
 assert.equal(first.scopeTaskQuantities[task.id],3)
 assert.ok(Math.abs(getRoomTaskContribution(first,type,index,'weekly',60,10)-2.1)<0.000001)
 assert.equal(getRoomTaskContribution(saved.roomItems[1],original,index,'weekly',60,10),0.7)
 assert.ok(Math.abs(getRoomTaskContribution({...first,quantity:2},type,index,'weekly',60,20)-4.2)<0.000001)
 assert.equal(getRoomTaskContribution({...first,scopeTaskSelections:{[task.id]:false}},type,index,'weekly',60,10),0)
 const report=buildClientScopeReport('TEST',inputs,{totalLow:90,totalHigh:100},saved,config)
 const output=JSON.stringify(report)
 assert.ok(output.includes('Clean special cabinet (quantity: 3 per room)'))
 assert.equal(output.includes('"minutesPerSqm"'),false)
 assert.equal(output.includes('"defaultSelected"'),false)
})
test('task quantity validates whole positive bounded numbers and preserves frequency scaling',()=>{
 for(const quantity of [0,-1,1.5,1001,Infinity,'3']) assert.equal(validWorkflowInput({firmQuoteDraft:{roomItems:[{...baseRoom,scopeTaskQuantities:{[custom.id]:quantity}}]}}),false)
 const room={...baseRoom,quantity:1,quoteTasks:[{...custom,price:10,cadence:'alternate_days'}],scopeTaskQuantities:{[custom.id]:3}}
 const type=getWorkflowRoomTypeConfig(room,config)
 assert.equal(getRoomTaskContribution(room,type,type.scopeTaskIds.indexOf(custom.id),'weekly',60,10),15)
})

test('saved picker includes independent global tasks and follows additions, renames and deletion', async()=>{
 const { getSavedQuoteOptions, appendGlobalQuoteTask } = await import('../src/lib/savedQuoteFields.ts')
 const rate={code:'replenish_consumables',label:'Replenish Consumables as required',pricingMode:'fixed',pricePerRoom:1,minutesPerSqm:0}
 const catalogue={...config,globalTaskRates:[rate]}
 const before=JSON.stringify(catalogue)
 const options=getSavedQuoteOptions(catalogue)
 assert.equal(options.find(item=>item.value==='task:replenish_consumables').label,rate.label)
 assert.deepEqual(options.map(item=>item.label),options.map(item=>item.label).sort((a,b)=>a.localeCompare(b,'en-AU',{sensitivity:'base',numeric:true})))
 const changed={...catalogue,globalTaskRates:[{...rate,label:'AAA Refill supplies'},{...rate,code:'z_new',label:'ZZZ new task'}]}
 assert.equal(getSavedQuoteOptions(changed)[0].label,'AAA Refill supplies')
 assert.ok(getSavedQuoteOptions(changed).some(item=>item.value==='task:z_new'))
 assert.equal(getSavedQuoteOptions({...catalogue,globalTaskRates:[]}).some(item=>item.value==='task:replenish_consumables'),false)
 const room={...baseRoom,quantity:1,...appendGlobalQuoteTask(baseRoom,catalogue,rate.code,'quote-task-replenish')}
 const saved=parseFirmQuoteDraft({roomItems:[room]},inputs,catalogue).roomItems[0]
 const type=getWorkflowRoomTypeConfig(saved,catalogue)
 const index=type.scopeTaskIds.indexOf('quote-task-replenish')
 assert.equal(type.scopeTasks[index],rate.label)
 assert.equal(type.scopeTaskCadences[index],'as_needed')
 assert.equal(getRoomTaskContribution(saved,type,index,'weekly',60,10),1)
 assert.equal(JSON.stringify(catalogue),before)
 assert.throws(()=>appendGlobalQuoteTask(baseRoom,{...catalogue,globalTaskRates:[]},rate.code,'quote-task-deleted'))
})
test('adding an area catalogue task preserves its area pricing instead of converting it to a fixed field',async()=>{
 const {appendGlobalQuoteTask}=await import('../src/lib/savedQuoteFields.ts')
 const catalogue={...config,globalTaskRates:[{code:'special_area',label:'Special area task',pricingMode:'area',pricePerRoom:0,minutesPerSqm:0.25}]}
 const room={...baseRoom,...appendGlobalQuoteTask(baseRoom,catalogue,'special_area','quote-task-area')}
 const type=getWorkflowRoomTypeConfig(room,catalogue)
 assert.equal(getRoomTaskContribution(room,type,type.scopeTaskIds.indexOf('quote-task-area'),'weekly',60,20),5)
})

test('section titles move between rooms, preserve room data and survive quote reload without affecting pricing',async()=>{
 const {quoteEntries,moveQuoteEntry}=await import('../src/lib/quoteSections.ts')
 const {buildFirmQuotePreview}=await import('../src/lib/quoteWorkflow.ts')
 const {DEFAULT_QUOTE_PRICING_CONFIG}=await import('../src/lib/pricing.ts')
 const rooms=[baseRoom,{...baseRoom,id:'r2',label:'Upstairs room'},{...baseRoom,id:'r3',label:'Last room'}]
 const sections=[{id:'section-ground',label:'Ground Floor',beforeRoomId:'r'},{id:'section-upper',label:'Upper Floor',beforeRoomId:null}]
 let moved=moveQuoteEntry(rooms,sections,'section-upper','r2')
 assert.deepEqual(quoteEntries(moved.roomItems,moved.sectionTitles).map(item=>item.id),['section-ground','r','section-upper','r2','r3'])
 assert.deepEqual(moved.roomItems,rooms)
 moved=moveQuoteEntry(moved.roomItems,moved.sectionTitles,'r3','section-upper')
 assert.deepEqual(quoteEntries(moved.roomItems,moved.sectionTitles).map(item=>item.id),['section-ground','r','r3','section-upper','r2'])
 assert.equal(validWorkflowInput({firmQuoteDraft:moved}),true)
 const saved=parseFirmQuoteDraft(JSON.parse(JSON.stringify(moved)),inputs,config)
 assert.deepEqual(saved.sectionTitles,moved.sectionTitles)
 assert.deepEqual(buildFirmQuotePreview(saved,DEFAULT_QUOTE_PRICING_CONFIG,config),buildFirmQuotePreview({...saved,sectionTitles:[]},DEFAULT_QUOTE_PRICING_CONFIG,config))
 const report=buildClientScopeReport('TEST',inputs,{totalLow:90,totalHigh:100},saved,config)
 assert.deepEqual(quoteEntries(report.rooms,report.sectionTitles).map(item=>item.label),['Ground Floor','Reception','Last room','Upper Floor','Upstairs room'])
 assert.equal(report.rooms.length,3)
 assert.equal(validWorkflowInput({firmQuoteDraft:{sectionTitles:[{...sections[0],label:'x'.repeat(201)}]}}),false)
 assert.equal(validWorkflowInput({firmQuoteDraft:{sectionTitles:Array(101).fill(sections[0])}}),false)
})
test('section ordering handles consecutive and trailing headings and missing anchors without losing titles',async()=>{
 const {quoteEntries,moveQuoteEntry}=await import('../src/lib/quoteSections.ts')
 const sections=[{id:'section-a',label:'A',beforeRoomId:'r'},{id:'section-b',label:'B',beforeRoomId:'r'},{id:'section-c',label:'C',beforeRoomId:'deleted-room'}]
 assert.deepEqual(quoteEntries([baseRoom],sections).map(item=>item.id),['section-a','section-b','r','section-c'])
 const moved=moveQuoteEntry([baseRoom],sections,'section-a','section-c')
 assert.deepEqual(quoteEntries(moved.roomItems,moved.sectionTitles).map(item=>item.id),['section-b','r','section-c','section-a'])
 assert.deepEqual(moveQuoteEntry([baseRoom],sections,'missing','r'),{roomItems:[baseRoom],sectionTitles:sections})
})

test('saved quote PDF includes section titles before their rooms',async()=>{
 const {buildCrmQuoteAttachment}=await import('../src/lib/crmQuoteAttachment.ts')
 const draft=parseFirmQuoteDraft({roomItems:[baseRoom],sectionTitles:[{id:'section-ground',label:'Ground Floor',beforeRoomId:'r'}]},inputs,config)
 const attachment=buildCrmQuoteAttachment({id:'send-test',quote_ref:'SC-TEST',document_version:1,finalized_at:'2026-11-21T00:00:00Z',document_snapshot:{version:1,inputs,result:{totalLow:90,totalHigh:100},firmQuoteDraft:draft,roomTypeConfig:config,reviewedAt:'2026-11-21T00:00:00Z'}})
 const text=attachment.content.toString('utf8')
 assert.ok(text.includes('GROUND FLOOR'))
 assert.ok(text.indexOf('GROUND FLOOR')<text.indexOf('RECEPTION'))
})
