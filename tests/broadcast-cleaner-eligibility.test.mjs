import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('recipient picker includes lead and pending applicants with the same state and suppression checks', async () => {
 const rows=['lead','pending_approval','approved','paused','rejected','inactive'].map((status,i)=>({id:String(i),status,state:'NSW',email:`${i}@example.com`,contact_name:status}))
 rows.push({id:'other',status:'lead',state:'VIC',email:'other@example.com'}, {id:'bad',status:'lead',state:'NSW',email:'invalid'}, {id:'duplicate',status:'lead',state:'NSW',email:'0@example.com'}, {id:'blocked',status:'lead',state:'NSW',email:'blocked@example.com'}, {id:'unsubscribe',status:'pending_approval',state:'NSW',email:'unsubscribe@example.com'})
 const db={from(table){let result=table==='cleaners'?rows:table==='crm_email_suppressions'?[{email_normalized:'blocked@example.com',blocks_all:true}]:[{cleaner_id:'unsubscribe'}];const q={select(){return q},eq(k,v){result=result.filter(r=>r[k]===v);return q},in(k,values){result=result.filter(r=>values.includes(r[k]));return q},order(){return q},range(){return Promise.resolve({data:result,error:null})}};return q}}
 const mocks={'@/lib/supabase':{getAdminSupabase:()=>db},'@/lib/contractProductPolicy':{normalizeContractProductState:x=>['NSW','VIC'].includes(x)?x:null},'@/lib/contractProducts':{ContractProductError:Error},'@/lib/emailDeliveryQueue':{readEmailPages:async fn=>(await fn(0,249)).data}}
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/contractProductBroadcasts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,require:n=>mocks[n]??{}})
 const result=await exports.listEligibleContractProductBroadcastCleaners({role:'agent',productState:'NSW'},{state:'NSW'})
 assert.deepEqual(Array.from(result.cleaners,c=>c.name),['lead','pending_approval','approved'])
 assert.equal(result.excluded.invalidEmail,1);assert.equal(result.excluded.suppressed,2);assert.equal(result.excluded.duplicateEmail,1)
 await assert.rejects(exports.listEligibleContractProductBroadcastCleaners({role:'agent',productState:'VIC'},{state:'NSW'}),/assigned state/)
})
