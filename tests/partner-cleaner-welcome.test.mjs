import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import * as crypto from 'node:crypto'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service'
const emailPolicy = await import('../src/lib/cleanerEmailPolicy.ts')
import * as intakePolicy from '../src/lib/partnerCleanerPolicy.ts'
import * as bookingPolicy from '../src/lib/partnerBookingPolicy.ts'
import * as messages from '../src/lib/partnerCleanerMessage.ts'
import { compareBookingPriority } from '../src/lib/availabilityPriority.ts'
import { getStateForAvailabilityCity } from '../src/lib/cleanerAgentPolicy.ts'
import { defaultCleanerServiceAreas } from '../src/lib/cleanerServiceAreas.ts'
const actor={id:'caller',session_version:'session',company:{active:true,cities:['sydney'],expires_at:null}}
const requestId='11111111-1111-4111-8111-111111111111'
const cleaner={id:'cleaner',email:'cleaner@example.test',first_name:'Alex <b>',last_name:'',contact_name:'Alex <b>',business_name:'Fixture & Co',city:'sydney',state:'NSW',suburb:'Sydney'}
const template={id:'22222222-2222-4222-8222-222222222222',name:'New Cleaner First Email',is_active:true,subject:'Welcome <<first_name>>',body:'Hello <<first_name>>,\n\nWelcome to <<business_name>>.',body_html:'<p>Hello &lt;&lt;first_name&gt;&gt;,</p><p>Welcome to &lt;&lt;business_name&gt;&gt;.</p>'}
const agent=(id,city,bookingPriority,active=true)=>({id,city,bookingPriority,active})
const sender={id:'staff',displayName:'Fixture Agent',jobTitle:'Regional Agent',phone:'0400000000',email:'agent@example.test',from:'Fixture Agent - Secure Cleaning <info@securecleaning.com.au>',replyTo:'agent@example.test',cc:'agent@example.test'}
class Rejected extends Error {}
function load(file,mocks) {
 const exports={}; const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{exports,process:{env:{}},console,require(name){if(name==='server-only')return {};assert.ok(name in mocks,name);return mocks[name]}});return exports
}
function fixture(mode='sent',agents=[agent('nsw','sydney',2),agent('vic','melbourne',1)]) {
 const calls=[],sent=[],alerts=[],snapshots=[],selected=[];let status='queued',profileStatus='queued'
 const db={async rpc(name,args){calls.push({name,args});
  if(name==='create_partner_cleaner_intake')return {data:{created:calls.filter(c=>c.name===name).length===1,emailStatus:profileStatus,welcomeEmailStatus:status}}
  if(name==='claim_partner_cleaner_email'){if(profileStatus!=='queued')return {data:null};profileStatus='sending';return {data:{cleanerId:cleaner.id,email:cleaner.email,firstName:cleaner.first_name,businessName:cleaner.business_name}}}
  if(name==='complete_partner_cleaner_email'){profileStatus=args.p_outcome;return {data:null}}
  if(name==='claim_partner_cleaner_welcome_email'){if(mode==='lost-claim'||status!=='queued')return {data:null};status='sending';return {data:{emailId:'email',cleaner}}}
  if(name==='complete_partner_cleaner_welcome_email'){if(mode==='completion-error')return {error:{code:'unavailable'}};status=args.p_outcome;return {data:null}}
  throw new Error(name)
 },from(table){const query={select(){return query},eq(){return query},update(data){snapshots.push(data);return query},async maybeSingle(){return {data:{broadcast_unsubscribe_token:mode==='missing-token'?null:'fixture-token'}}},async single(){return mode==='history-error'?{error:{code:'unavailable'}}:{data:{id:'email'}}}};assert.ok(['cleaners','cleaner_emails'].includes(table));return query}}
 const send=async(payload,options)=>{sent.push({payload,options});const isWelcome=options.idempotencyKey.includes('welcome');if((mode==='failed'&&isWelcome)||(mode==='profile-failed'&&!isWelcome))throw new Rejected();if(mode==='unknown'&&isWelcome)throw new Error('network unknown');return {id:`provider-${sent.length}`}}
 const alert={reportEmailFailure:async value=>alerts.push(value)}
 const mocks={'./supabase':{getAdminSupabase:()=>db},'./partnerBookingAvailability':{loadPartnerConfig:async()=>{if(mode==='config-error')throw new Error('unavailable');return {config:{assignees:agents}}}},'./availabilityPriority':{compareBookingPriority},'./cleanerAgentPolicy':{getStateForAvailabilityCity},'./cleanerEmailSenders':{resolveCleanerEmailSender:async(a,_id,state)=>{selected.push({a,state});if(mode==='missing-signature')throw new Error('incomplete');return sender}},'./cleanerEmailTemplates':{listCleanerEmailTemplates:async()=>mode==='missing-template'?[]:[{...template,is_active:mode!=='archived-template'}]},'./cleanerEmailPolicy':emailPolicy,'./email':{EmailProviderRejectedError:Rejected,sendEmailOrThrow:send},'./emailFailureAlerts':alert,'./siteUrl':{getSiteUrl:()=> 'https://example.test'}}
 const welcome=load('src/lib/partnerCleanerWelcome.ts',mocks)
 const service=load('src/lib/partnerCleanerCreate.ts',{'node:crypto':crypto,'./supabase':mocks['./supabase'],'./partnerBookingPolicy':bookingPolicy,'./partnerCleanerPolicy':intakePolicy,'./cleanerServiceAreas':{defaultCleanerServiceAreas},'./cleanerPortal':{createCleanerPortalLink:()=> 'https://example.test/private-profile-link'},'./email':mocks['./email'],'./emailFailureAlerts':alert,'./partnerCleanerMessage':messages,'./siteUrl':mocks['./siteUrl'],'./partnerCleanerWelcome':welcome})
 return {welcome,service,calls,sent,alerts,snapshots,selected,get status(){return status}}
}
test('welcome selects active state agent by priority, independent of other states and stable on ties',async()=>{
 for(const agents of [[agent('second','sydney',8),agent('first','sydney',2),agent('disabled','sydney',1,false),agent('vic','melbourne',1)],[agent('b','sydney',2),agent('a','sydney',2)]]){
  const f=fixture('sent',agents);await f.welcome.resolvePartnerCleanerWelcome('NSW');assert.equal(f.selected[0].a.id,agents.length===4?'first':'a');assert.equal(f.selected[0].state,'NSW')
 }
 for(const [state,city] of [['VIC','melbourne'],['QLD','brisbane']]) { const f=fixture('sent',[agent('nsw','sydney',1),agent('regional',city,5)]);await f.welcome.resolvePartnerCleanerWelcome(state);assert.equal(f.selected[0].a.id,'regional') }
 const f=fixture('sent',[agent('vic','melbourne',1)]);await assert.rejects(()=>f.welcome.resolvePartnerCleanerWelcome('NSW'),/No active agent/);assert.equal(f.selected.length,0)
})
test('welcome renders stored wording and escaped personalisation with signature, CC, reply-to and unsubscribe',async()=>{
 const f=fixture();assert.equal(await f.welcome.sendPartnerCleanerWelcome(actor,requestId,'queued'),'sent');assert.equal(f.sent.length,1)
 const {payload,options}=f.sent[0]
 assert.equal(payload.cc,sender.email);assert.equal(payload.replyTo,sender.email);assert.equal(payload.from,sender.from);assert.equal(payload.to,cleaner.email)
 assert.match(payload.text,/Fixture Agent\nRegional Agent\nSecure Cleaning\n0400000000\nagent@example.test/)
 assert.match(payload.html,/Alex &lt;b&gt;/);assert.match(payload.text,/Fixture & Co/);assert.doesNotMatch(payload.html,/<b>|approved cleaner profile|Internal call notes|private-profile-link/)
 assert.match(payload.text,/asked our calling team/);assert.match(payload.html,/Unsubscribe/)
 assert.equal(payload.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.match(payload.headers['List-Unsubscribe'],/api\/cleaner-email-preferences\/unsubscribe/)
 assert.equal(options.idempotencyKey,`partner-cleaner-welcome/${requestId}`)
 assert.equal(f.snapshots[0].template_id,template.id);assert.equal(f.snapshots[0].final_html_snapshot,payload.html);assert.equal(f.snapshots[0].delivery_headers.cc,sender.email)
 assert.equal(await f.welcome.sendPartnerCleanerWelcome(actor,requestId,'queued'),'review_required');assert.equal(f.sent.length,1)
})
test('missing agent, template, signature, preferences or history holds welcome and records owner alert without sending',async()=>{
 for(const mode of ['missing-template','archived-template','missing-signature','missing-token','history-error','missing-agent','config-error']){
  const f=fixture(mode,mode==='missing-agent'?[]:undefined)
  assert.equal(await f.welcome.sendPartnerCleanerWelcome(actor,requestId,'queued'),'failed',mode)
  assert.equal(f.sent.length,0,mode);assert.equal(f.alerts[0].outcome,'not_sent');assert.ok(f.calls.at(-1).args.p_reason)
 }
})
test('welcome delivery outcomes are independent, durable and never blindly resent',async()=>{
 for(const mode of ['failed','unknown','completion-error','lost-claim']){
  const f=fixture(mode);const result=await f.welcome.sendPartnerCleanerWelcome(actor,requestId,'queued')
  assert.equal(result,['completion-error','lost-claim'].includes(mode)?'review_required':mode)
  assert.equal(f.sent.length,mode==='lost-claim'?0:1)
  await f.welcome.sendPartnerCleanerWelcome(actor,requestId,f.status);assert.equal(f.sent.length,mode==='lost-claim'?0:1)
 }
 for(const status of ['not_required','sent','failed','unknown','sending','skipped','review_required']) {const f=fixture();assert.equal(await f.welcome.sendPartnerCleanerWelcome(actor,requestId,status),status);assert.equal(f.calls.length,0)}
})
const input={idempotencyKey:requestId,businessName:'Fixture Cleaning',firstName:'Alex',lastName:'',email:cleaner.email,phone:'0400000000',city:'sydney',suburb:'Sydney',postcode:'2000',notes:'Internal call notes',emailConsent:true,welcomeEmailConsent:true}
test('new lead sends two separate emails; replay does not resend; partial failures do not hide either status',async()=>{
 for(const mode of ['sent','failed','profile-failed','missing-template']){
  const f=fixture(mode);const result=await f.service.createPartnerCleaner(actor,input)
  assert.equal(result.emailStatus,mode==='profile-failed'?'team_review':'sent')
  assert.equal(result.welcomeEmailStatus,['failed','missing-template'].includes(mode)?'team_review':'sent')
  assert.equal(f.sent.length,mode==='missing-template'?1:2)
  const first=f.sent[0].payload;assert.match(first.text,/private-profile-link/);assert.equal(first.cc,undefined)
  const second=f.sent[1]?.payload;if(second){assert.equal(second.cc,sender.email);assert.doesNotMatch(second.text,/private-profile-link|Internal call notes/)}
  const count=f.sent.length;await f.service.createPartnerCleaner(actor,input);assert.equal(f.sent.length,count)
 }
})
test('new consent flag is explicit and old fingerprints remain unchanged',()=>{
 const {welcomeEmailConsent:_,...legacy}=input
 assert.equal(intakePolicy.partnerCleanerDetails(legacy,actor.company).welcomeEmailConsent,undefined)
 assert.equal(intakePolicy.partnerCleanerDetails(input,actor.company).welcomeEmailConsent,true)
 for(const value of [false,'true',null])assert.equal(intakePolicy.partnerCleanerDetails({...input,welcomeEmailConsent:value},actor.company).welcomeEmailConsent,undefined)
})
