import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
const rich=await import('../src/lib/richEmailServer.ts')
const fields=await import('../src/lib/contractProductBroadcastTemplateTokens.ts')
const source=ts.transpileModule(readFileSync(new URL('../src/lib/contractProductBroadcasts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const actor={id:'11111111-1111-4111-8111-111111111111',role:'owner',active:true,displayName:'Test Owner',email:'owner@example.test',jobTitle:'Owner',phone:'0400000000',productState:null}
const key='22222222-2222-4222-8222-222222222222'
function fixture(options={}) {
 const campaign={id:'campaign',idempotency_key:key,created_by_staff_id:actor.id,state:'NSW',status:'sending',subject_snapshot:'Test jobs',intro_snapshot:'Hello {{first_name}}',recipient_mode:'state',sender_staff_id:actor.id,sent_count:1,failed_count:1,skipped_count:0,delivery_snapshot:{sender:actor,jobsUrl:'https://example.test/jobs',fromAddress:'quotes@example.test'}}
 const recipients=['sent','unknown','sending','queued','queued'].map((status,i)=>({id:`recipient-${i}`,campaign_id:'campaign',cleaner_id:`cleaner-${i}`,to_email:`cleaner${i}@example.test`,status}))
 const cleaners=recipients.map((r,i)=>({id:r.cleaner_id,email:r.to_email,first_name:`Cleaner${i}`,contact_name:`Cleaner${i}`,business_name:'Fixture Cleaner',broadcast_unsubscribe_token:`token-${i}`,state:'NSW'}))
 const sends=[],enqueues=[];let failFinalize=options.failFinalize,leased=false
 const tables={cleaner_broadcast_campaigns:[campaign],cleaner_broadcast_recipients:recipients,cleaner_broadcast_campaign_products:[{campaign_id:'campaign',product_id:'product',product_snapshot:{id:'product',productCode:'C100',suburb:'Sydney',state:'NSW',heading:'Test job',frequency:'weekly',timePreference:'after_hours',annualValueIncGstCents:100000,purchasePriceIncGstCents:10000}}],cleaners}
 const db={from(table){
  assert.ok(tables[table],`unexpected table ${table}`)
  const filters=[];let updates=null,limit=Infinity,start=0,end=Infinity,single=false
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,values){filters.push(r=>values.includes(r[k]));return q},order(){return q},limit(v){limit=v;return q},range(a,b){start=a;end=b;return q},update(v){updates=v;return q},maybeSingle(){single=true;return q},then(resolve){
   let rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(start,end+1).slice(0,limit)
   if(updates&&failFinalize&&table==='cleaner_broadcast_recipients'&&updates.status==='sent'){failFinalize=false;return Promise.resolve({data:null,error:Error('Lost finalization')}).then(resolve)}
   if(updates)rows.forEach(r=>Object.assign(r,updates))
   rows=rows.map(r=>structuredClone(r));return Promise.resolve({data:single?(rows[0]??null):rows,error:null}).then(resolve)
  }};return q
 },async rpc(name,args){
  if(name==='claim_cleaner_broadcast_campaign'){if(leased)return{data:false};leased=true;campaign.runner_token=args.p_runner_token;return{data:true}}
  if(name==='claim_cleaner_broadcast_recipient'){const r=recipients.find(r=>r.id===args.p_recipient_id);if(r.status!=='queued')return{data:false};r.status=options.suppressed?'suppressed':'sending';return{data:!options.suppressed}}
  throw Error(`unexpected rpc ${name}`)
 }}
 class Rejected extends Error{constructor(name){super(name);this.providerErrorName=name}}
 const module={}
 vm.runInNewContext(source,{exports:module,process:{env:{}},crypto,Date,URL,console,require:name=>({
  'server-only':{},'@/lib/supabase':{getAdminSupabase:()=>db},
  '@/lib/backgroundEmailQueue':{requireBackgroundEmailWorker(){},enqueueBackgroundEmail:async(...args)=>enqueues.push(args),backgroundEmailStatus:async()=>({backgroundStatus:'queued',paused:false})},
  '@/lib/emailDeliveryQueue':{readEmailPages:async callback=>(await callback(0,249)).data,waitForEmailDeliverySlot:async()=>true,emailProviderPause:error=>error.providerErrorName==='monthly_quota_exceeded'?'quota':null,EMAIL_DELIVERY_STEP_SIZE:10,EMAIL_DELIVERY_STEP_MS:12000},
  '@/lib/email':{EmailProviderRejectedError:Rejected,sendEmailOrThrow:async(payload,opts)=>{sends.push({payload,opts});if(options.unknown)throw Error('timeout');if(options.quota)throw new Rejected('monthly_quota_exceeded');return{id:`provider-${sends.length}`}}},
  '@/lib/contractProducts':{ContractProductError:Error},
  '@/lib/contractProductPolicy':{normalizeContractProductState:s=>s},
  '@/lib/clientCrmPolicy':{hasCompleteCrmSignature:()=>true},
  '@/lib/richEmailServer':rich,'@/lib/contractProductBroadcastTemplateTokens':fields,
  '@/lib/siteUrl':{getSiteUrl:()=> 'https://example.test'},
  '@/lib/staffAccounts':{getStaffAccountProfileById:async()=>actor},
  '@/lib/premisesCatalog':{premisesLabel:()=> 'Office'},
 }[name]??{})})
 async function tick(){leased=false;return module.continueContractProductBroadcast(actor,{idempotencyKey:key},true)}
 return{...module,tick,recipients,sends,enqueues,campaign}
}
test('existing broadcast queues without sending; worker skips accepted, unknown and stale claims',async()=>{
 const f=fixture();const saved=await f.continueContractProductBroadcast(actor,{idempotencyKey:key});assert.equal(f.sends.length,0);assert.equal(f.enqueues.length,1);assert.equal(saved.remainingCount,2)
 await f.getContractProductBroadcastStatus(actor,{idempotencyKey:key});assert.equal(f.sends.length,0)
 await f.tick();assert.equal(f.sends.length,2)
 assert.deepEqual(f.recipients.map(r=>r.status),['sent','unknown','unknown','sent','sent'])
 assert.deepEqual(f.sends.map(s=>s.opts.idempotencyKey),['cleaner-broadcast/recipient-3','cleaner-broadcast/recipient-4'])
 await f.tick();assert.equal(f.sends.length,2)
})
test('broadcast provider acceptance with lost finalization and unknown response are never resent',async()=>{
 for(const options of [{failFinalize:true},{unknown:true}]){
  const f=fixture(options);await f.tick();const sent=f.sends.length;await f.tick();assert.equal(f.sends.length,sent);assert.equal(f.recipients[3].status,'unknown')
 }
})
test('explicit quota non-acceptance stays queued and pauses, recipient suppression skips provider',async()=>{
 const f=fixture({quota:true});const result=await f.tick();assert.equal(result.paused,true);assert.equal(f.recipients[3].status,'queued');assert.equal(f.sends.length,1)
 const skipped=fixture({suppressed:true});await skipped.tick();assert.equal(skipped.sends.length,0);assert.equal(skipped.recipients[3].status,'suppressed')
})
