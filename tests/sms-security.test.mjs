import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as policy from '../src/lib/smsPolicy.ts'
import * as provider from '../src/lib/mobileMessage.ts'
test('SMS quote terminal checks compare the quote status enum as text',()=>{
 const repair=readFileSync(new URL('../supabase/sms_quote_status_enum_repair.sql',import.meta.url),'utf8')
 assert.match(repair,/NEW\.status::text IN/)
 assert.match(repair,/q\.status::text IN/)
 assert.doesNotMatch(repair,/NEW\.status IN \('accepted', 'withdrawn'/)
 assert.doesNotMatch(repair,/q\.status IN \('accepted', 'withdrawn'/)
})
function moduleWithMocks(path,mocks,globals={}) {
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 vm.runInNewContext(code,{exports,Buffer,URLSearchParams,console,process,Date,...globals,require(name){if(name==='server-only')return {};if(!(name in mocks))throw new Error(`Unexpected dependency: ${name}`);return mocks[name]}})
 return exports
}
function dataFixture({allowed=true,live=false}={}) {
 let actor={id:'agent',role:'agent',availabilityAssigneeId:'sydney'},rpcCalls=[]
 const settings={auto_enabled:false,delay_minutes:5,template:policy.DEFAULT_SMS_TEMPLATE,alert_email:'info@securecleaning.com.au',low_credit_threshold:100,credit_price_cents:4,max_parts:2,health:{ready:true,checkedAt:new Date().toISOString()},worker_at:new Date().toISOString()}
 let quote={id:'quote-id',quoteRef:'SC-1',status:'sent',validUntil:'2099-01-01',inputs:{city:'sydney'},firmQuoteDraft:{status:'sent'},finalDocument:{version:1,inputs:{city:'sydney',contactName:'Alex Client',phone:'0412345678'}}}
 const values={sms_settings:settings,quote_send_attempts:[{id:'attempt'}],sms_preferences:{consent:true,opted_out:false}}
 const db={from(table){const chain=new Proxy({},{get(_,name){if(name==='then')return resolve=>resolve({data:values[table],error:null});return()=>chain}});return chain},rpc:async(...args)=>{rpcCalls.push(args);return{data:true,error:null}}}
 const mod=moduleWithMocks('src/lib/smsData.ts',{'node:crypto':crypto,'./premisesCatalogServer':{resolveQuoteIndustry:async()=> 'Office'},'./supabase':{getAdminSupabase:()=>db},'./clientCrmAuth':{getClientCrmActor:async()=>actor},'./availability':{getAvailabilityConfig:async()=>({})},'./clientCrmQuoteAccess':{canAvailabilityAgentAccessQuote:async()=>allowed},'./quoteWorkflowData':{getQuoteWorkflowByRef:async()=>quote},'./smsPolicy':policy,'./mobileMessage':{...provider,smsLiveEnabled:()=>live}})
 return {mod,values,rpcCalls,actor,setActor:v=>actor=v,setQuote:v=>quote=v,quote}
}
test('SMS server permissions reject signed-out and cross-region access before returning quote data',async()=>{
 const f=dataFixture({allowed:false});f.setActor(null)
 await assert.rejects(f.mod.smsActor({}),/sign-in/)
 await assert.rejects(f.mod.smsQuote(f.actor,'SC-1'),/not found/)
 assert.throws(()=>f.mod.requireSmsOwner(f.actor),/Owner/)
 assert.throws(()=>f.mod.requireSmsOwner({role:'manager'}),/Owner/)
 assert.equal(f.rpcCalls.length,0)
})
test('manual quote SMS requires consent, successful email submission and active final version',async()=>{
 process.env.ADMIN_SESSION_SECRET='test-only-secret'
 const f=dataFixture()
 f.values.sms_preferences={consent:false,opted_out:false};await assert.rejects(f.mod.prepareSms(f.actor,{quoteRef:'SC-1'}),/permission/)
 f.values.sms_preferences={consent:true,opted_out:false};f.values.quote_send_attempts=[];await assert.rejects(f.mod.prepareSms(f.actor,{quoteRef:'SC-1'}),/not been confirmed/)
 f.values.quote_send_attempts=[{id:'attempt'}];f.setQuote({...f.quote,status:'accepted'});await assert.rejects(f.mod.prepareSms(f.actor,{quoteRef:'SC-1'}),/active final quote/)
 assert.equal(f.rpcCalls.length,0)
})
test('manual SMS is disabled by default and modified or expired previews cannot send',async()=>{
 process.env.ADMIN_SESSION_SECRET='test-only-secret'
 const off=dataFixture();await assert.rejects(off.mod.queueManualSms(off.actor,{confirmed:true}),/disabled/)
 const f=dataFixture({live:true}),preview=await f.mod.prepareSms(f.actor,{quoteRef:'SC-1'})
 const input={quoteRef:'SC-1',message:preview.message,requestId:preview.id,expires:preview.expires,fingerprint:preview.fingerprint,confirmed:true}
 await assert.rejects(f.mod.queueManualSms(f.actor,{...input,message:preview.message.replace("We've emailed your quote",'Your quote is ready')}),/changed/)
 await assert.rejects(f.mod.queueManualSms(f.actor,{...input,confirmed:false}),/confirm/)
 await assert.rejects(f.mod.queueManualSms(f.actor,{...input,expires:Date.now()-1000}),/expired/)
 assert.equal(f.rpcCalls.length,0)
 await f.mod.queueManualSms(f.actor,input)
 assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0][0],'sms_enqueue_manual')
 assert.equal(f.rpcCalls[0][1].p_mobile,'61412345678')
})
test('test sends require owner, explicit confirmation and server-side allowlist',async()=>{
 process.env.ADMIN_SESSION_SECRET='test-only-secret'
 process.env.SMS_TEST_RECIPIENTS='61411111111'
 const f=dataFixture({live:true}),input={test:true,mobile:'0412345678',city:'sydney'}
 await assert.rejects(f.mod.prepareSms(f.actor,input),/Owner/)
 const owner={id:'owner',role:'owner'},preview=await f.mod.prepareSms(owner,input)
 await assert.rejects(f.mod.queueManualSms(owner,{...input,confirmed:true,requestId:preview.id,expires:preview.expires,fingerprint:preview.fingerprint}),/allowlist/)
 assert.equal(f.rpcCalls.length,0)
})
function workerFixture({job,providerHistory=[],providerError=null,enabled=true,cachedHealth={},freshHealth={ready:true,balance:1000,sender:'61499999999'},healthError=null,inboundResults=[],inboundTotal=0,preferences=[],pending=[]}={}) {
 const updates=[],requests=[],rpc=[],checks=[],events=[],alerts=[]
 const settings={...policy,health:cachedHealth,inbound_checked_at:new Date().toISOString(),low_credit_threshold:100,max_parts:2}
 const db={from(table){let value={data:null,error:null};const chain=new Proxy({},{get(_,name){if(name==='then')return resolve=>resolve(value);return(...args)=>{
 if(name==='select')value={data:table==='sms_preferences'?preferences:null,error:null}
 if(name==='update')updates.push([table,args[0]])
 if(name==='eq'&&args[0]==='status'&&args[1]==='submitted')value={data:pending,error:null}
 return chain
 }}});return chain},rpc:async(name,args)=>{rpc.push([name,args]);return{data:name==='sms_worker_lock'?true:name==='sms_claim'?(job?[job]:[]):name==='sms_dispatch'?[{...job,first_attempt_at:new Date().toISOString(),status:'submitting',attempt_count:1}]:null,error:null}}}
 const mod=moduleWithMocks('src/lib/smsWorker.ts',{'node:crypto':crypto,'./premisesCatalogServer':{resolveQuoteIndustry:async()=> 'Office'},'./supabase':{getAdminSupabase:()=>db},'./smsPolicy':policy,'./smsData':{smsSettings:async()=>settings},'./smsAlerts':{smsAlert:async(code)=>alerts.push(code),deliverSmsAlerts:async()=>alerts.push('delivered_alerts')},'./smsEvents':{processSmsEvent:async(event)=>events.push(event)},'./mobileMessage':{
 SmsProviderError:provider.SmsProviderError,smsLiveEnabled:()=>enabled,smsCredentialsConfigured:()=>true,providerScope:()=> 'same-scope',checkSmsConnection:async()=>{checks.push('check');if(healthError)throw healthError;return freshHealth},mobileMessageRequest:async(path,method,body,key)=>{requests.push({path,method,body,key});if(path.startsWith('inbound'))return{status:'complete',results:inboundResults,total:inboundTotal};if(path.startsWith('messages?'))return{status:'complete',results:providerHistory};if(providerError)throw providerError;return {status:'complete',results:[{status:'success',message_id:'provider-1',cost:1}]}}
 }})
 return {mod,updates,requests,rpc,checks,events,alerts}
}
const baseJob={id:'12345678-1234-4234-8234-123456789012',lease_token:'lease',quote_ref:'SC-1',document_version:1,mobile:'61412345678',message:policy.DEFAULT_SMS_TEMPLATE,template:policy.DEFAULT_SMS_TEMPLATE,fields:{},time_zone:'Australia/Sydney',first_attempt_at:null,attempt_count:0,provider_scope:null,request_payload:null,purpose:'quote_followup',status:'leased'}
test('history reconciliation supports live and documented recipient fields without resending',async()=>{
 const job={...baseJob,provider_id:'provider-1',first_attempt_at:new Date().toISOString()}
 for(const identity of [{to:job.mobile},{recipient_number:job.mobile},{to:'0412 345 678'},{recipient_number:'+61412345678',to:job.mobile}]) {
  const f=workerFixture({job,providerHistory:[{...identity,message_id:'provider-1',custom_ref:`sms:${job.id}`,status:'delivered',cost:'1.00'}]})
  assert.equal(await f.mod.reconcileSmsJob(job),true)
  assert.ok(f.rpc.some(([name,args])=>name==='sms_record_acceptance'&&args.p_provider==='provider-1'))
  assert.ok(f.updates.some(([,value])=>value.status==='delivered'))
  assert.equal(f.requests.filter(r=>r.method==='POST').length,0)
 }
})
test('history reconciliation rejects missing, conflicting or mismatched message identity',async()=>{
 const job={...baseJob,provider_id:'provider-1',first_attempt_at:new Date().toISOString()}
 for(const identity of [{},{to:'61499999999'},{recipient_number:job.mobile,to:'61499999999'},{recipient_number:null,to:job.mobile},{to:'invalid'},{to:job.mobile,message_id:''},{to:job.mobile,message_id:123},{to:job.mobile,message_id:'different-provider-id'}]) {
  const f=workerFixture({job,providerHistory:[{message_id:'provider-1',...identity,custom_ref:`sms:${job.id}`,status:'delivered',cost:1}]})
  await assert.rejects(f.mod.reconcileSmsJob(job),/provider_history_mismatch/)
  assert.equal(f.rpc.length,0);assert.equal(f.updates.length,0);assert.equal(f.requests.filter(r=>r.method==='POST').length,0)
 }
})
test('history reconciliation refuses ambiguous records and ignores other references',async()=>{
 const match={to:baseJob.mobile,message_id:'provider-1',custom_ref:`sms:${baseJob.id}`,status:'sent',cost:1}
 const duplicate=workerFixture({providerHistory:[match,match]})
 await assert.rejects(duplicate.mod.reconcileSmsJob(baseJob),/duplicate_provider_records/)
 const unrelated=workerFixture({providerHistory:[{...match,custom_ref:'other-reference'}]})
 assert.equal(await unrelated.mod.reconcileSmsJob(baseJob),false)
 assert.equal(duplicate.rpc.length+unrelated.rpc.length,0)
})
test('worker records provider acceptance with the immutable job idempotency key',async()=>{
 const f=workerFixture({job:baseJob});await f.mod.runSmsWorker()
 const send=f.requests.find(r=>r.method==='POST');assert.equal(send.key,baseJob.id);assert.equal(send.body.ignore_unsubscribes,false);assert.equal(send.body.messages[0].custom_ref,`sms:${baseJob.id}`)
 assert.ok(f.rpc.some(([name])=>name==='sms_record_acceptance'))
})
test('worker reconciles accepted timeout without resending and preserves immutable retry payload',async()=>{
 const payload={messages:[{to:baseJob.mobile,message:baseJob.message,sender:'61499999999',custom_ref:`sms:${baseJob.id}`}],max_parts:2,ignore_unsubscribes:false,enable_unicode:true,shorten_urls:false}
 const job={...baseJob,first_attempt_at:new Date().toISOString(),attempt_count:1,provider_scope:'same-scope',request_payload:payload}
 const found=workerFixture({job,providerHistory:[{message_id:'provider-1',recipient_number:job.mobile,custom_ref:`sms:${job.id}`,status:'sent',cost:1}]});await found.mod.runSmsWorker();assert.equal(found.requests.filter(r=>r.method==='POST').length,0)
 const retry=workerFixture({job});await retry.mod.runSmsWorker();const sent=retry.requests.find(r=>r.method==='POST');assert.equal(sent.key,job.id);assert.equal(sent.body,payload)
})
test('uncertain outcome never replays after cancellation, credential rotation or idempotency expiry',async()=>{
 for(const changes of [{cancel_requested:true},{provider_scope:'old-scope'},{first_attempt_at:new Date(Date.now()-24*3600_000).toISOString()}]) {
  const job={...baseJob,first_attempt_at:new Date().toISOString(),provider_scope:'same-scope',attempt_count:1,...changes}
  const f=workerFixture({job});await f.mod.runSmsWorker();assert.equal(f.requests.filter(r=>r.method==='POST').length,0);assert.ok(f.updates.some(([,v])=>v.status==='review'))
 }
})
test('provider rejection, timeout and disabled environment have distinct safe outcomes',async()=>{
 const off=workerFixture({job:baseJob,enabled:false});await off.mod.runSmsWorker();assert.equal(off.requests.length,0)
 for(const [error,status] of [[new provider.SmsProviderError('provider_connection_unknown',true),'unknown'],[new provider.SmsProviderError('provider_http_403'),'failed']]) {
  const f=workerFixture({job:baseJob,providerError:error});await f.mod.runSmsWorker();assert.ok(f.updates.some(([,v])=>v.status===status))
 }
 const f=workerFixture({job:baseJob});assert.equal(f.mod.smsResult({status:'complete',results:[{status:'blocked'}]}),null)
 assert.throws(()=>f.mod.smsResult({status:'complete',results:[]}),/unknown/)
})

test('manual SMS cannot override quote-specific email-only contact',async()=>{
 const f=dataFixture()
 f.values.sms_quote_requests={allowed:false}
 await assert.rejects(f.mod.prepareSms(f.actor,{quoteRef:'SC-1'}),/email-only/)
 assert.equal(f.rpcCalls.length,0)
})
test('quote-request persistence uses normalized mobile, fixed notice version and no global preference',async()=>{
 const calls=[]
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:true,error:null}}}
 const m=moduleWithMocks('src/lib/quoteSmsRequest.ts',{
  './premisesCatalogServer':{resolveQuoteIndustry:async()=> 'Office'},'./supabase':{getAdminSupabase:()=>db},'./smsPolicy':policy,
  './quoteSmsNotice':{QUOTE_SMS_NOTICE_VERSION:'2026-10-06'},
 })
 assert.equal(await m.recordQuoteSmsRequest({quoteRef:'SC-1',phone:'(04) 1234 5678',source:'online_request',actorId:'online_customer',allowed:false}),true)
 assert.equal(calls[0].name,'sms_record_quote_request')
 assert.equal(calls[0].args.p_mobile,'61412345678')
 assert.equal(calls[0].args.p_allowed,false)
 assert.equal(calls[0].args.p_notice_version,'2026-10-06')
 assert.equal(await m.recordQuoteSmsRequest({quoteRef:'SC-1',phone:'02 9999 9999',source:'agent_request',actorId:'agent',allowed:true}),false)
 assert.equal(calls.length,1)
 assert.equal(await m.recordRemoteQuoteEmail({quoteRef:'SC-1',phone:'0412345678',email:'client@example.test',providerMessageId:null}),false)
 assert.equal(calls.length,1)
 assert.equal(await m.recordRemoteQuoteEmail({quoteRef:'SC-1',phone:'0412345678',email:'client@example.test',providerMessageId:'email-id'}),true)
 assert.equal(calls[1].name,'sms_record_remote_quote_email')
 assert.equal(calls[1].args.p_provider_message_id,'email-id')
})

const recentHealth=()=>({ready:true,balance:1000,sender:'61499999999',checkedAt:new Date().toISOString()})
test('healthy idle worker reuses diagnostics but keeps inbound, STOP sync, delivery and alerts running',async()=>{
 const job={...baseJob,provider_id:'provider-1',submitted_at:new Date(Date.now()-25*3600_000).toISOString()}
 const f=workerFixture({cachedHealth:recentHealth(),inboundResults:[{from:baseJob.mobile,message:'STOP'}],preferences:[{mobile:baseJob.mobile}],pending:[job],providerHistory:[{to:job.mobile,custom_ref:`sms:${job.id}`,message_id:'provider-1',status:'delivered',cost:1}]})
 await f.mod.runSmsWorker()
 assert.equal(f.checks.length,0)
 assert.equal(f.events[0].message,'STOP')
 assert.ok(f.requests.some(r=>r.path==='unsubscribes'&&r.method==='POST'))
 assert.ok(f.requests.some(r=>r.path.startsWith('messages?')))
 assert.ok(f.alerts.includes('delivery_confirmation_overdue'))
 assert.ok(f.alerts.includes('delivered_alerts'))
 assert.equal(f.requests.filter(r=>r.path==='messages'&&r.method==='POST').length,0)
 const writes=f.updates.filter(([table])=>table==='sms_settings').map(([,value])=>value)
 assert.equal(writes.length,2)
 assert.ok(writes[0].worker_at)
 assert.ok(writes[1].inbound_checked_at)
 assert.equal(writes[1].worker_token,null)
 assert.equal(writes[1].health,undefined)
})
test('idle diagnostics refresh after five minutes and reject missing, invalid, future or unhealthy cache',async()=>{
 for(const health of [{},{...recentHealth(),ready:false},{...recentHealth(),checkedAt:'invalid'},{...recentHealth(),checkedAt:new Date(Date.now()+60_000).toISOString()},{...recentHealth(),checkedAt:new Date(Date.now()-5*60_000).toISOString()}]) {
  const f=workerFixture({cachedHealth:health});await f.mod.runSmsWorker()
  assert.equal(f.checks.length,1)
  const writes=f.updates.filter(([table])=>table==='sms_settings')
  assert.equal(writes.length,2)
  assert.equal(writes[1][1].health.ready,true)
  assert.ok(writes[1][1].inbound_checked_at)
 }
})
test('claimed jobs require fresh provider readiness and balance even with healthy cached diagnostics',async()=>{
 for(const failure of [{freshHealth:{ready:false,balance:1000}},{healthError:new provider.SmsProviderError('provider_http_401')},{freshHealth:{ready:true,balance:0}}]) {
  const f=workerFixture({job:baseJob,cachedHealth:recentHealth(),...failure});await f.mod.runSmsWorker()
  assert.equal(f.checks.length,1)
  assert.equal(f.requests.filter(r=>r.path==='messages'&&r.method==='POST').length,0)
  assert.ok(f.alerts.some(code=>code!=='delivered_alerts'))
 }
 const f=workerFixture({job:baseJob,cachedHealth:recentHealth()});await f.mod.runSmsWorker()
 assert.equal(f.checks.length,1)
 assert.equal(f.requests.filter(r=>r.path==='messages'&&r.method==='POST').length,1)
})
test('inbound backlog still blocks dispatch and does not advance recovery checkpoint',async()=>{
 const f=workerFixture({job:baseJob,cachedHealth:recentHealth(),inboundTotal:201});await f.mod.runSmsWorker()
 assert.equal(f.rpc.some(([name])=>name==='sms_claim'),false)
 assert.equal(f.updates.some(([,value])=>value.inbound_checked_at),false)
 assert.ok(f.alerts.includes('inbound_backlog_requires_review'))
 assert.equal(f.updates.at(-1)[1].health.ready,false)
})

test('SMS settings enforce a five-minute minimum without changing other settings',async()=>{
 const f=dataFixture(),owner={id:'owner',role:'owner'}
 for(const delay_minutes of [0,1,4,4.5,121]) await assert.rejects(f.mod.saveSmsSettings(owner,{...f.values.sms_settings,delay_minutes}),/Check the delay/)
 for(const delay_minutes of [5,10,120]) await f.mod.saveSmsSettings(owner,{...f.values.sms_settings,delay_minutes})
 assert.equal(f.rpcCalls.length,3)
})

test('SMS activation accepts the idle recovery interval but rejects a stale worker',async()=>{
 const f=dataFixture({live:true}),owner={id:'owner',role:'owner'}
 f.values.sms_settings.worker_at=new Date(Date.now()-20*60_000).toISOString()
 await f.mod.saveSmsSettings(owner,{...f.values.sms_settings,auto_enabled:true})
 f.values.sms_settings.worker_at=new Date(Date.now()-26*60_000).toISOString()
 await assert.rejects(f.mod.saveSmsSettings(owner,{...f.values.sms_settings,auto_enabled:true}),/scheduler/)
})

test('manual SMS resolves the linked industry field before preview', async () => {
 process.env.ADMIN_SESSION_SECRET='test-only-secret'
 const f=dataFixture({live:true})
 f.values.sms_settings.template = 'Secure Cleaning: <<industry>> quote {{quote_reference}} is ready. Reply STOP to opt out.'
 const preview = await f.mod.prepareSms(f.actor,{quoteRef:'SC-1'})
 assert.match(preview.message,/Office/)
 assert.doesNotMatch(preview.message,/<<industry>>/)
})
