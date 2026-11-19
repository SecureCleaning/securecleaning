import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
const compile=path=>ts.transpileModule(readFileSync(new URL(`../src/${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const source=compile('lib/backgroundEmailWorker')
function fixture(options={}) {
 const jobs=options.jobs??[{kind:'broadcast',target_id:'campaign',actor_id:'owner',failures:0,status:'queued'}]
 const calls=[],account={id:'owner',active:true,role:'owner',...options.account}
 const db={async rpc(name,args){
  calls.push({name,args})
  if(name==='claim_background_email_job') {const job=jobs.find(j=>j.status==='queued');if(!job)return{data:[]};job.status='running';job.token=args.p_token;return{data:[{...job}]}}
  if(name==='finish_background_email_job'){const job=jobs.find(j=>j.target_id===args.p_target_id&&j.token===args.p_token);if(!job)return{data:false};job.status=args.p_status;job.code=args.p_failure_code;job.failures=job.code?job.failures+1:0;return{data:true}}
  throw Error('unexpected RPC')
 },from(table){assert.equal(table,'cleaner_broadcast_campaigns');const q={select(){return q},eq(){return q},async maybeSingle(){return{data:{idempotency_key:'saved-request'}}}};return q}}
 const exports={}
 vm.runInNewContext(source,{exports,require:name=>({
  'server-only':{},'node:crypto':crypto,'@/lib/supabase':{getAdminSupabase:()=>db},
  '@/lib/staffAccounts':{getStaffAccountProfileById:async()=>account},
  '@/lib/availability':{getAvailabilityConfig:async()=>({}),getAvailabilityAssignee:()=>({active:true,city:'Sydney'})},
  '@/lib/contractProductPolicy':{getContractProductStateForCity:()=> 'NSW'},
  '@/lib/contractProductBroadcasts':{continueContractProductBroadcast:async(actor,input,worker)=>{calls.push({send:'broadcast',actor,input,worker});if(options.fail)throw Error('Private provider error');await options.wait;return options.result??{inProgress:false}}},
  '@/lib/cleanerEmailDelivery':{continueCleanerEmail:async(actor,id,worker)=>{calls.push({send:'cleaner_batch',actor,id,worker});return options.result??{inProgress:false}}},
 }[name]??{})})
 return{...exports,jobs,calls}
}
test('worker does nothing without an explicitly enrolled job',async()=>{const f=fixture({jobs:[]});assert.equal((await f.runBackgroundEmailWorker()).processed,0);assert.equal(f.calls.filter(c=>c.send).length,0)})
test('worker continues the saved request as its original actor; overlapping tick cannot claim it twice',async()=>{
 let release;const wait=new Promise(r=>release=r),f=fixture({wait,result:{inProgress:true}})
 const first=f.runBackgroundEmailWorker();await new Promise(r=>setTimeout(r,0))
 assert.equal((await f.runBackgroundEmailWorker()).processed,0);release();await first
 assert.equal(f.calls.filter(c=>c.send).length,1)
 const send=f.calls.find(c=>c.send);assert.equal(send.input.idempotencyKey,'saved-request');assert.equal(send.actor.id,'owner');assert.equal(send.worker,true)
 assert.equal(f.jobs[0].status,'queued')
})
test('disabled actor never sends and a changed regional assignment is freshly resolved',async()=>{
 const disabled=fixture({account:{active:false}});await disabled.runBackgroundEmailWorker();assert.equal(disabled.jobs[0].status,'review');assert.equal(disabled.calls.filter(c=>c.send).length,0)
 const agent=fixture({account:{role:'agent',availabilityAssigneeId:'current-region'}});await agent.runBackgroundEmailWorker();assert.equal(agent.calls.find(c=>c.send).actor.productState,'NSW')
 const unlinked=fixture({account:{role:'agent'}});await unlinked.runBackgroundEmailWorker();assert.equal(unlinked.calls.filter(c=>c.send).length,0)
})
test('quota pauses, finished jobs stop, and repeated infrastructure errors require review',async()=>{
 const quota=fixture({result:{inProgress:true,paused:true}});await quota.runBackgroundEmailWorker();assert.equal(quota.jobs[0].status,'paused');assert.equal(quota.jobs[0].code,'provider_quota')
 const done=fixture();await done.runBackgroundEmailWorker();await done.runBackgroundEmailWorker();assert.equal(done.jobs[0].status,'completed');assert.equal(done.calls.filter(c=>c.send).length,1)
 const error=fixture({fail:true});for(let i=0;i<3;i++)await error.runBackgroundEmailWorker();assert.equal(error.jobs[0].status,'review');assert.equal(error.jobs[0].code,'delivery_check_required')
})
test('cleaner batch dispatch uses the saved batch identifier and worker-only path',async()=>{const f=fixture({jobs:[{kind:'cleaner_batch',target_id:'batch',actor_id:'owner',failures:0,status:'queued'}]});await f.runBackgroundEmailWorker();const c=f.calls.find(c=>c.send);assert.equal(c.send,'cleaner_batch');assert.equal(c.id,'batch');assert.equal(c.worker,true)})
test('worker endpoint rejects missing or incorrect secrets before touching the queue',async()=>{
 const source=compile('app/api/email/worker/route');let runs=0
 const exports={};vm.runInNewContext(source,{exports,process:{env:{BULK_EMAIL_WORKER_SECRET:'x'.repeat(32),RESEND_API_KEY:'synthetic'}},require:name=>({
  'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},
  '@/lib/mobileMessage':{secureTokenMatch:(a,b)=>a===b},
  '@/lib/backgroundEmailWorker':{runBackgroundEmailWorker:async()=>{runs++;return{processed:0}}},
  '@/lib/supabase':{getAdminSupabase:()=>({rpc:async()=>({data:true})})},
 }[name]??{})})
 for(const token of ['', 'Bearer wrong']){assert.equal((await exports.POST({headers:new Headers({authorization:token})})).status,401);assert.equal(runs,0)}
 assert.equal((await exports.POST({headers:new Headers({authorization:`Bearer ${'x'.repeat(32)}`})})).status,200);assert.equal(runs,1)
 assert.equal((await exports.GET({headers:new Headers({authorization:`Bearer ${'x'.repeat(32)}`})})).body.ready,true);assert.equal(runs,1)
})
