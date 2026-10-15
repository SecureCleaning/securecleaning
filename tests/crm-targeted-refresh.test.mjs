import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { followUpSummary } from '../src/lib/crmFollowUpSummary.ts'
import { createVisibleRefresh } from '../src/lib/visibleRefresh.ts'

const flush=()=>new Promise(resolve=>setImmediate(resolve))
function load(path,mocks,globals={}) {
 const exports={}
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{exports,console,AbortController,Promise,...globals,require(name){if(name in mocks)return mocks[name];throw Error(`Unexpected import ${name}`)}})
 return exports
}
test('visible refresh serializes slow reads and coalesces mutation/focus requests',async()=>{
 let visible=true,active=0,max=0,calls=0
 const releases=[]
 const c=createVisibleRefresh({visible:()=>visible,onError:assert.fail,run:async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>releases.push(r));active--}})
 const first=c.refresh();c.refresh();c.refresh()
 assert.equal(calls,1);releases.shift()();await flush();assert.equal(calls,2)
 visible=false;c.refresh();releases.shift()();await first;assert.equal(calls,2)
 visible=true;const resumed=c.refresh();assert.equal(calls,3);releases.shift()();await resumed
 assert.equal(max,1);c.stop();await c.refresh();assert.equal(calls,3)
})
test('hidden tabs defer reads; failures recover; unmount aborts and suppresses late errors',async()=>{
 let visible=false,calls=0,errors=0,signal
 const c=createVisibleRefresh({visible:()=>visible,onError:()=>errors++,run:async s=>{calls++;signal=s;throw Error('offline')}})
 await c.refresh();assert.equal(calls,0)
 visible=true;await c.refresh();assert.equal(errors,1);await c.refresh();assert.equal(calls,2)
 c.stop();assert.equal(signal.aborted,true)
 let reject
 const late=createVisibleRefresh({visible:()=>true,onError:assert.fail,run:()=>new Promise((_,r)=>reject=r)})
 const pending=late.refresh();late.stop();reject(Error('cancelled'));await pending
})
test('visibility hook attaches mutation/focus listeners, pauses hidden polls and cleans up',async()=>{
 let cleanup,timer,calls=0
 const listeners=new Map(),docListeners=new Map()
 const win={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setInterval:f=>{timer=f;return 1},clearInterval:()=>{timer=null}}
 const doc={visibilityState:'hidden',addEventListener:(n,f)=>docListeners.set(n,f),removeEventListener:n=>docListeners.delete(n)}
 const m=load('src/lib/useVisibleRefresh.ts',{'react':{useRef:v=>({current:v}),useEffect:f=>{cleanup=f()},useCallback:f=>f},'./visibleRefresh':{createVisibleRefresh}},{window:win,document:doc})
 m.useVisibleRefresh(async()=>{calls++},30000,assert.fail,'quotes','changed')
 timer();await flush();assert.equal(calls,0)
 doc.visibilityState='visible';docListeners.get('visibilitychange')();await flush();assert.equal(calls,1)
 listeners.get('changed')();await flush();assert.equal(calls,2)
 doc.visibilityState='hidden';timer();listeners.get('focus')();await flush();assert.equal(calls,2)
 cleanup();assert.equal(listeners.size,0);assert.equal(docListeners.size,0);assert.equal(timer,null)
})
class CrmError extends Error {constructor(message,status=400){super(message);this.status=status}}
function database(tables) {
 const calls=[]
 return {calls,from(table){
  const call={table,fields:'',filters:[],start:0,end:Infinity};calls.push(call)
  const chain={select(fields){call.fields=fields;return chain},returns(){return chain},eq(k,v){call.filters.push(r=>r[k]===v);return chain},neq(k,v){call.filters.push(r=>r[k]!==v);return chain},in(k,v){call.filters.push(r=>v.includes(r[k]));return chain},not(k,op,v){call.filters.push(r=>op==='is'?r[k]!=null:!v.slice(1,-1).split(',').includes(r[k]));return chain},order(){return chain},range(a,b){call.start=a;call.end=b;return chain},limit(n){call.end=n-1;return chain},maybeSingle(){call.single=true;return chain},then(resolve){let data=(tables[table]??[]).filter(r=>call.filters.every(f=>f(r))).slice(call.start,call.end+1);return Promise.resolve({data:call.single?data[0]??null:data,error:null}).then(resolve)}}
  return chain
 }}
}
const opp='11111111-1111-4111-8111-111111111111',emailId='22222222-2222-4222-8222-222222222222'
function reads(db){return load('src/lib/clientCrmReads.ts',{'./supabase':{getAdminSupabase:()=>db},'./crmFollowUpSummary':{followUpSummary},'./clientCrmPolicy':{canActorAccessAssignedOpportunity:(role,id,assigned)=>role!=='agent'||id===assigned},'./clientCrmData':{ClientCrmError:CrmError}})}
test('follow-ups select only summary metadata and retain agent ownership and activity labels',async()=>{
 const db=database({crm_opportunities:[{id:opp,assigned_staff_id:'agent',primary_contact_id:'contact',organisation_id:'org',stage:'new',next_follow_up_at:'2026-10-01'}, {id:'other',assigned_staff_id:'other',stage:'new',next_follow_up_at:'2026-10-01'}],clients:[{id:'contact',contact_name:'Synthetic',business_name:'Example'}],crm_organisations:[{id:'org',business_name:'Organisation'}],admin_staff_accounts:[{id:'agent',display_name:'Assigned agent'}],crm_communications:[{opportunity_id:opp,status:'sent',sent_at:'2026-10-02',template_id:'template'}],crm_email_templates:[{id:'template',name:'Welcome',visibility:'shared',status:'published'}]})
 const result=await reads(db).getCrmFollowUps({id:'agent',role:'agent'})
 assert.equal(result.opportunities.length,1);assert.equal(result.opportunities[0].summary,'Follow up: Welcome');assert.equal(result.opportunities[0].assignedStaffName,'Assigned agent')
 assert.equal(result.opportunities[0].businessName,'Organisation')
 for(const c of db.calls)assert.doesNotMatch(c.fields,/final_html|final_text|final_quote_document|body|notes|password|inputs/)
 for(const table of ['bookings','sites','leads','contract_products','crm_email_suppressions'])assert.equal(db.calls.some(c=>c.table===table),false)
})
test('follow-ups do not hide reminders beyond 200 rows or include closed opportunities',async()=>{
 const rows=Array.from({length:201},(_,n)=>({id:String(n),stage:'new',next_follow_up_at:'2026-10-01'}))
 rows.push({id:'closed',stage:'won',next_follow_up_at:'2026-10-01'})
 const db=database({crm_opportunities:rows})
 assert.equal((await reads(db).getCrmFollowUps({id:'owner',role:'owner'})).opportunities.length,201)
 assert.deepEqual(db.calls.filter(c=>c.table==='crm_opportunities').map(c=>c.start),[0,200])
})
test('saved email bodies require opportunity ownership and matching email before content is returned',async()=>{
 const db=database({crm_opportunities:[{id:opp,assigned_staff_id:'agent'}],crm_communications:[{id:emailId,opportunity_id:opp,subject_snapshot:'Subject',final_html_snapshot:'<p>Synthetic</p>'}]})
 const m=reads(db)
 await assert.rejects(m.getCrmSentEmail({id:'other',role:'agent'},opp,emailId),e=>e.status===404)
 assert.equal(db.calls.some(c=>c.table==='crm_communications'),false)
 assert.equal((await m.getCrmSentEmail({id:'agent',role:'agent'},opp,emailId)).html,'<p>Synthetic</p>')
 await assert.rejects(m.getCrmSentEmail({id:'agent',role:'agent'},opp,'invalid'),e=>e.status===400)
 await assert.rejects(m.getCrmSentEmail({id:'agent',role:'agent'},opp,'33333333-3333-4333-8333-333333333333'),e=>e.status===404)
})
test('dashboard refresh reads only the requested list and visible summary data',async()=>{
 const db=database({bookings:[],leads:[]});let quoteReads=0,alertReads=0
 const m=load('src/lib/adminDashboardRefresh.ts',{'./supabase':{getAdminSupabase:()=>db},'./dashboardQuotes':{getDashboardQuotes:async(_,summary)=>{assert.equal(summary,true);quoteReads++;return{data:[],error:null}}},'./reporting':{getReportingSnapshot:async()=>({quoteCount:1})},'./alerts':{getAdminAlerts:async()=>{alertReads++;return[]}}})
 await m.getAdminDashboardRefresh('quotes',false);assert.equal(quoteReads,1);assert.equal(db.calls.length,0);assert.equal(alertReads,0)
 await m.getAdminDashboardRefresh('leads',true);assert.deepEqual(db.calls.map(c=>c.table),['leads']);assert.equal(alertReads,1)
})
test('dashboard API denies unauthenticated reads and validates list scope before querying',async()=>{
 let allowed=false,calls=0
 const m=load('src/app/api/admin/dashboard/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},'@/lib/adminAuth':{isAuthorizedAdminRequest:async()=>allowed},'@/lib/adminDashboardRefresh':{getAdminDashboardRefresh:async()=>{calls++;return{}}}})
 const request=tab=>({nextUrl:new URL(`https://example.test/api/admin/dashboard?tab=${tab}`)})
 assert.equal((await m.GET(request('quotes'))).status,401);assert.equal(calls,0)
 allowed=true;assert.equal((await m.GET(request('invalid'))).status,400);assert.equal(calls,0)
 assert.equal((await m.GET(request('quotes'))).status,200);assert.equal(calls,1)
})

test('quote summary requests project searchable JSON fields without fetching the full inputs document',async()=>{
 const {createClient}=await import('@supabase/supabase-js')
 const {getDashboardQuotes}=await import('../src/lib/dashboardQuotes.ts')
 const urls=[]
 const db=createClient('https://example.invalid','test-only',{global:{fetch:async input=>{
  urls.push(new URL(String(input)))
  return new Response(JSON.stringify([{id:'quote',quote_ref:'SC-TEST',status:'pending',businessName:'Synthetic',contactName:'Client',suburb:'Example',postcode:'2000'}]),{status:200,headers:{'Content-Type':'application/json'}})
 }}})
 const result=await getDashboardQuotes(db,true)
 assert.equal(result.data[0].inputs.businessName,'Synthetic')
 assert.equal(result.data[0].inputs.postcode,'2000')
 const fields=urls[0].searchParams.get('select')
 assert.match(fields,/businessName:inputs->>businessName/)
 assert.doesNotMatch(fields,/(?:^|,)inputs(?:,|$)|final_quote_document/)
})

test('workspace history selects metadata; quote documents and email bodies are fetched only through detail reads',()=>{
 const source=readFileSync(new URL('../src/lib/clientCrmData.ts',import.meta.url),'utf8')
 const workspace=source.slice(source.indexOf('export async function getClientCrmWorkspace'),source.indexOf('export async function updateCrmProfile'))
 assert.doesNotMatch(workspace,/final_html_snapshot|final_text_snapshot/)
 assert.match(workspace,/document_version:final_quote_document->version/)
 assert.doesNotMatch(workspace,/, final_quote_document,/)
})
