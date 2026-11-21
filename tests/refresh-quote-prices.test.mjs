import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test'
process.env.SUPABASE_SERVICE_ROLE_KEY='test'
const {refreshQuotePrices}=await import('../src/lib/refreshQuotePrices.ts')
const {DEFAULT_QUOTE_ROOM_TYPE_CONFIG,getRoomScopeTaskDefinitions}=await import('../src/lib/roomTypeConfig.ts')
const {createDefaultFirmQuoteDraft,parseFirmQuoteDraft}=await import('../src/lib/quoteWorkflow.ts')
const {validWorkflowInput}=await import('../src/lib/securityInput.ts')
const inputs={businessName:'Test',contactName:'Test',email:'test@example.com',phone:'0400000000',city:'sydney',suburb:'Test',postcode:'2000',premisesType:'office',floorArea:100,floors:1,flooringType:'mixed',frequency:'weekly',timePreference:'business_hours',addOns:{bathrooms:0,kitchens:0,windows:0,consumables:false,highTouchDisinfection:false,carpetSteam:false}}
const old=structuredClone(DEFAULT_QUOTE_ROOM_TYPE_CONFIG)
const type=old.roomTypes.find(room=>room.id==='reception')
const task=getRoomScopeTaskDefinitions(type)[0]
const newer={...old,globalTaskRates:[{code:'refill',label:'New admin wording',pricingMode:'fixed',pricePerRoom:8,minutesPerSqm:0}],roomTypes:old.roomTypes.map(room=>room.id==='reception'?{...room,scopeTasks:room.scopeTasks.map((label,i)=>i===0?'Changed default wording':label),scopeTaskIds:getRoomScopeTaskDefinitions(room).map(t=>t.id),scopeTaskPrices:room.scopeTasks.map(()=>5),scopeTaskPricingModes:room.scopeTasks.map(()=>'fixed'),fields:[{id:'special_bins',label:'Bins',inputType:'number',defaultValue:1,includedUnits:0,pricePerUnit:4,cadence:'every_clean'}]}:room)}
function draft(){return {...createDefaultFirmQuoteDraft(inputs,old),finalPerVisit:'300',targetPrice:'250',pricingAdjustmentPercent:10,sectionTitles:[{id:'section-floor',label:'Ground Floor',beforeRoomId:'r'}],roomItems:[{id:'r',type:'reception',label:'My room',quantity:2,size:20,floor:1,description:'Keep this wording',pricingOverride:true,fixedPricePerVisit:50,pricingAdjustmentPercent:20,metrics:{saved_bins:3},customMetricFields:[{id:'saved_bins',label:'My bins wording',inputType:'number',defaultValue:1,includedUnits:0,pricePerUnit:9,cadence:'monthly'}],fieldSourceIds:{saved_bins:'special_bins'},quoteTasks:[{...task,label:'My task wording',price:20},{id:'quote-task-refill',label:'My refill wording',pricingMode:'fixed',price:2,minutesPerSqm:0,defaultSelected:true,cadence:'as_needed'}],taskSourceCodes:{'quote-task-refill':'refill'},scopeTaskQuantities:{[task.id]:3},scopeTaskSelections:{[task.id]:false},scopeTaskCadences:{[task.id]:'monthly'}}]}}
test('keeping custom prices preserves overrides and quote details without mutating the draft',()=>{
 const source=draft(),before=JSON.stringify(source)
 const result=refreshQuotePrices(source,newer,false,old).draft
 assert.equal(result.roomItems[0].quoteTasks.find(t=>t.id===task.id).price,20)
 assert.equal(result.roomItems[0].customMetricFields[0].pricePerUnit,9)
 assert.equal(result.roomItems[0].fixedPricePerVisit,50)
 assert.equal(result.finalPerVisit,'300')
 assert.equal(result.pricingAdjustmentPercent,10)
 assert.deepEqual(result.sectionTitles,source.sectionTitles)
 assert.equal(JSON.stringify(source),before)
})
test('replacement updates matched rates while retaining words, quantities, selection and schedules',()=>{
 const source=draft(),result=refreshQuotePrices(source,newer,true,old)
 const room=result.draft.roomItems[0]
 assert.equal(room.quoteTasks.find(t=>t.id===task.id).price,5)
 assert.equal(room.quoteTasks.find(t=>t.id===task.id).label,'My task wording')
 assert.equal(room.quoteTasks.find(t=>t.id==='quote-task-refill').price,8)
 assert.equal(room.quoteTasks.find(t=>t.id==='quote-task-refill').label,'My refill wording')
 assert.equal(room.customMetricFields[0].label,'My bins wording')
 assert.equal(room.customMetricFields[0].pricePerUnit,4)
 for(const key of ['quantity','size','floor','description','metrics','scopeTaskQuantities','scopeTaskSelections','scopeTaskCadences']) assert.deepEqual(room[key],source.roomItems[0][key])
 assert.equal(result.draft.finalPerVisit,'');assert.equal(result.draft.targetPrice,'');assert.equal(result.draft.pricingAdjustmentPercent,0)
 assert.equal(room.pricingOverride,false)
 assert.equal(validWorkflowInput({firmQuoteDraft:result.draft}),true)
 const saved=parseFirmQuoteDraft(JSON.parse(JSON.stringify(result.draft)),inputs,newer)
 assert.equal(saved.roomItems[0].taskSourceCodes['quote-task-refill'],'refill')
 assert.equal(saved.roomItems[0].fieldSourceIds.saved_bins,'special_bins')
})
test('standard tasks retain wording but refresh prices again after an earlier refresh',()=>{
 const source=draft();source.roomItems[0].quoteTasks=[]
 const first=refreshQuotePrices(source,newer,false,old).draft
 assert.equal(first.roomItems[0].quoteTasks.find(t=>t.id===task.id).label,task.label)
 assert.equal(first.roomItems[0].quoteTasks.find(t=>t.id===task.id).price,5)
 const latest={...newer,roomTypes:newer.roomTypes.map(r=>({...r,scopeTaskPrices:r.scopeTasks.map(()=>7)}))}
 const second=refreshQuotePrices(first,latest,false,newer).draft
 assert.equal(second.roomItems[0].quoteTasks.find(t=>t.id===task.id).price,7)
 assert.equal(second.roomItems[0].quoteTasks.find(t=>t.id===task.id).label,task.label)
})
test('unmatched custom prices are reported and retained',()=>{
 const source=draft();source.roomItems[0].taskSourceCodes['quote-task-refill']='deleted'
 const result=refreshQuotePrices(source,newer,true,old)
 assert.ok(result.unmatched.includes('My room: My refill wording'))
 assert.equal(result.draft.roomItems[0].quoteTasks.find(t=>t.id==='quote-task-refill').price,2)
})
test('agent price refresh checks authentication and quote access before returning configs',async()=>{
 const source=readFileSync(new URL('../src/app/api/availability-agent/[assigneeId]/quotes/[ref]/workflow/route.ts',import.meta.url),'utf8')
 let authenticated=false,allowed=false,reads=0
 const exports={}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}}
  if(name==='@/lib/availabilityAgentAuth')return {isAuthorizedAvailabilityAgentRequest:async()=>authenticated}
  if(name==='@/lib/availability')return {getAvailabilityConfig:async()=>({}),getAvailabilityAssignee:()=>({id:'agent'})}
  if(name==='@/lib/clientCrmQuoteAccess')return {canAvailabilityAgentAccessQuote:async()=>allowed}
  if(name==='@/lib/quoteWorkflowData')return {getQuoteWorkflowByRef:async()=>({id:'quote'})}
  if(name==='@/lib/pricing')return {getQuotePricingConfig:async()=>{reads++;return {settings:{}}}}
  if(name==='@/lib/roomTypeConfig')return {getQuoteRoomTypeConfig:async()=>{reads++;return newer}}
  return {}
 }})
 const props={params:Promise.resolve({assigneeId:'agent',ref:'SC-test'})}
 assert.equal((await exports.GET({},props)).status,401);assert.equal(reads,0)
 authenticated=true
 assert.equal((await exports.GET({},props)).status,403);assert.equal(reads,0)
 allowed=true
 const result=await exports.GET({},props)
 assert.equal(result.status,200);assert.equal(reads,2);assert.equal(result.headers['Cache-Control'],'no-store')
})
