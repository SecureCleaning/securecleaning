import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:9'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-placeholder'
const policy = await import('../src/lib/contractProductPolicy.ts')
import * as details from '../src/lib/contractProductListingDetails.ts'
function fixture(overrides={}) {
 const row={id:'p',updated_at:'v1',status:'withdrawn',state:'NSW',assigned_staff_id:'agent',time_preference:'business_hours',client_price_per_visit_ex_gst_cents:8500,cleaner_scope_snapshot:{timePreference:'business_hours',rooms:[{id:'room'}]},...overrides},writes=[]
 const db={from(){let update;const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>resolve({data:{...row,...update},error:null});return(...args)=>{if(key==='update'){update=args[0];writes.push(update)}return chain}}});return chain}}
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/contractProducts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,console,require(name){if(name==='@/lib/supabase')return{getAdminSupabase:()=>db};if(name==='@/lib/contractProductPolicy')return policy;if(name==='@/lib/contractProductListingDetails')return details;return{}}})
 return{...exports,writes,row}
}
const actor={id:'agent',role:'agent',productState:'NSW'}
const input={productId:'p',expectedUpdatedAt:'v1',heading:'Office',description:'Evening clean',annualVisits:52,keyedJob:'keyed',estimatedHoursPerVisit:'1.1',timePreference:'after_hours'}
test('product save aligns listing and scope timing independently of key access',async()=>{
 for(const timing of ['business_hours','after_hours','weekend']) {
 const f=fixture();const saved=await f.updateContractProduct(actor,{...input,timePreference:timing})
 assert.equal(saved.timePreference,timing);assert.equal(f.writes[0].cleaner_scope_snapshot.timePreference,timing);assert.equal(f.writes[0].keyed_job,'keyed');assert.deepEqual(f.writes[0].cleaner_scope_snapshot.rooms,f.row.cleaner_scope_snapshot.rooms)
 }
 const f=fixture();const legacy={...input};delete legacy.timePreference;await f.updateContractProduct(actor,legacy);assert.equal(f.writes[0].time_preference,'business_hours')
})
test('invalid timing, inaccessible products and stale or published edits cannot write',async()=>{
 for(const [row,who,body] of [[{},actor,{...input,timePreference:'night-ish'}],[{},actor,{...input,timePreference:''}],[{state:'VIC'},actor,input],[{assigned_staff_id:'other'},actor,input],[{status:'available'},actor,input],[{updated_at:'v2'},actor,input]]) {
 const f=fixture(row);await assert.rejects(f.updateContractProduct(who,body));assert.equal(f.writes.length,0)
 }
})
