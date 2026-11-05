import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {crmActivity} from '../src/lib/crmActivity.ts'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
test('quote creation and all sent versions join timeline and filters without duplicate email rows',()=>{
 const notes=[{id:'n',createdAt:'2026-11-01'}], emails=[{id:'e',sentAt:'2026-11-03'}], quotes=[{id:'q',createdAt:'2026-10-30'}], sends=[{id:'s1',at:'2026-10-31'},{id:'s2',at:'2026-11-02'}]
 assert.deepEqual(crmActivity(notes,emails,'all',null,quotes,sends).map(x=>x.value.id),['e','s2','n','s1','q'])
 assert.deepEqual(crmActivity(notes,emails,'quotes',null,quotes,sends).map(x=>x.value.id),['s2','s1','q'])
 assert.deepEqual(crmActivity(notes,emails,'emails',null,quotes,sends).map(x=>x.value.id),['e','s2','s1'])
 assert.deepEqual(crmActivity(notes,emails,'all','2026-11-01|n',quotes,sends).map(x=>x.value.id),['e','s2','n'])
})
function moduleWith(rows,report={rooms:[],selectedOptions:[],businessName:'<script>bad</script>',summary:'Safe scope'}) {
 const calls=[]
 const db={from(table){calls.push(table);const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>({data:rows[table]??null,error:null})};return chain}}
 class CrmError extends Error{}
 const exports={}; vm.runInNewContext(ts.transpileModule(source('src/lib/crmQuoteActivity.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){
  if(name==='./supabase')return {getAdminSupabase:()=>db}
  if(name==='./clientCrmAuth')return {actorCanAccessOpportunity:(a,assigned)=>a.role==='owner'||a.id===assigned}
  if(name==='./clientCrmData')return {ClientCrmError:CrmError}
  if(name==='./scopeOfWorks')return {buildClientScopeReport:()=>report}
  if(name==='./roomTypeConfig')return {getRoomTaskCadenceLabel:x=>x}
  if(name==='./htmlEscape')return {escapeHtml:s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
  throw Error(name)
 }})
 return {api:exports,calls}
}
test('archive reads require assignment and a quote linked to the exact opportunity',async()=>{
 const rows={crm_opportunities:{id:id(1),assigned_staff_id:'agent',primary_contact_id:'contact'},quote_send_attempts:{id:id(2),quote_ref:'SC-example'},quotes:{id:id(3)},crm_opportunity_quotes:{quote_id:id(3)}}
 const {api,calls}=moduleWith(rows)
 await assert.rejects(api.getCrmQuoteSend({id:'other',role:'agent'},id(1),id(2)),/not found/)
 assert.deepEqual(calls,['crm_opportunities'])
 assert.equal((await api.getCrmQuoteSend({id:'agent',role:'agent'},id(1),id(2))).contactId,'contact')
 rows.crm_opportunity_quotes=null
 await assert.rejects(api.getCrmQuoteSend({role:'owner'},id(1),id(2)),/not found/)
})
test('missing historical content is explicit and archived quote output escapes text',async()=>{
 const rows={crm_opportunities:{id:id(1)},quote_send_attempts:{quote_ref:'SC-example',document_version:2},quotes:{id:id(3)},crm_opportunity_quotes:{quote_id:id(3)}}
 const {api}=moduleWith(rows)
 await assert.rejects(api.getCrmQuoteArchive({role:'owner'},id(1),id(2),false),/not archived/)
 await assert.rejects(api.getCrmQuoteArchive({role:'owner'},id(1),id(2),true),/not retained/)
 const html=api.renderArchivedQuote('SC-example',{version:2,inputs:{secret:'private'},firmQuoteDraft:{},result:{},roomTypeConfig:{}})
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('private'))
})
test('quote payload is archived before provider contact and archive errors prevent sending',async()=>{
 const code=source('src/lib/email.ts');const fn=code.slice(code.indexOf('export async function sendUpdatedQuoteEmail('),code.indexOf('// ─── Booking Email'))
 const calls=[]; const exports={}
 vm.runInNewContext(ts.transpileModule(fn,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,createQuoteCapability:async()=> 'token',buildUpdatedQuoteEmail:async()=>({subject:'exact',html:'html'}),sendEmailOrThrow:async p=>{calls.push('send');return p}})
 const result=await exports.sendUpdatedQuoteEmail('ref',{}, {},{archiveBeforeSend:async p=>{assert.equal(p.subject,'exact');calls.push('archive')}})
 assert.deepEqual(calls,['archive','send']);assert.equal(result.subject,'exact')
 calls.length=0
 await assert.rejects(exports.sendUpdatedQuoteEmail('ref',{}, {},{archiveBeforeSend:async()=>{throw Error('archive failed')}}),/archive failed/)
 assert.deepEqual(calls,[])
})
