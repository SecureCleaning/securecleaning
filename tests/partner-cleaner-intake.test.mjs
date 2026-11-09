import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as policy from '../src/lib/partnerCleanerPolicy.ts'
import * as bookingPolicy from '../src/lib/partnerBookingPolicy.ts'
import * as messages from '../src/lib/partnerCleanerMessage.ts'
import { defaultCleanerServiceAreas } from '../src/lib/cleanerServiceAreas.ts'
import { defaultPartnerCity } from '../src/lib/partnerPortalDefaults.ts'
import { createCleanerPortalToken, verifyCleanerPortalToken } from '../src/lib/cleanerPortalAccess.ts'

const company = {id:'company',name:'Caller Company',active:true,cities:['melbourne'],assignee_ids:[],expires_at:null}
const actor = {id:'caller',session_version:'version',company}
const input = {businessName:'Fixture Cleaning',firstName:'',lastName:'',email:' LEAD@EXAMPLE.TEST ',phone:'0400 000 000',city:'melbourne',suburb:'Melbourne',postcode:'3000',notes:'Private call notes',emailConsent:true,idempotencyKey:'11111111-1111-4111-8111-111111111111'}
const unsubscribeToken='22222222-2222-4222-8222-222222222222'
const unsubscribeUrl=`https://example.test/cleaner-email-preferences/unsubscribe?token=${unsubscribeToken}`
function moduleWithMocks(path,mocks) {
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,Buffer,Date,console,process:{env:{}},require(name){if(name==='server-only')return {};if(!(name in mocks))throw new Error(`Unexpected dependency ${name}`);return mocks[name]}});return exports
}

test('partner cleaner entry requires requested email consent, permitted matching locality and minimal details',()=>{
 const result=policy.partnerCleanerDetails({...input,status:'approved',cleanerId:'not-allowed'},company)
 assert.equal(result.firstName,'Manager'); assert.equal(result.email,'lead@example.test'); assert.equal(result.state,'VIC')
 assert.equal(result.status,undefined);assert.equal(result.cleanerId,undefined)
 for(const values of [{emailConsent:false},{businessName:''},{email:'one@example.test,two@example.test'},{email:'x@example.test\nBcc:y@example.test'},{phone:'123'},{phone:'abcdefgh'},{postcode:'2000'},{city:'sydney',suburb:'Sydney',postcode:'2000'},{idempotencyKey:'bad'}, {notes:'x'.repeat(1501)}]) assert.throws(()=>policy.partnerCleanerDetails({...input,...values},company))
 assert.throws(()=>policy.partnerCleanerDetails(input,{...company,active:false}),/state/)
 assert.throws(()=>policy.partnerCleanerDetails(input,{...company,expires_at:'2020-01-01'}),/state/)
})
test('partner state defaults to NSW only when enabled and otherwise uses an allowed state',()=>{
 assert.equal(defaultPartnerCity(['melbourne','sydney','brisbane']),'sydney')
 assert.equal(defaultPartnerCity(['melbourne','brisbane']),'melbourne')
 assert.equal(defaultPartnerCity(['brisbane']),'brisbane')
 assert.equal(defaultPartnerCity([]),'')
})
test('cleaner street address is optional, trimmed and bounded without changing old submission fingerprints',()=>{
 const prior=policy.partnerCleanerDetails(input,company)
 assert.equal(prior.address,undefined)
 assert.deepEqual(policy.partnerCleanerDetails({...input,address:'  '},company),prior)
 assert.equal(policy.partnerCleanerDetails({...input,address:'  Unit 2, 10 Example Street  '},company).address,'Unit 2, 10 Example Street')
 assert.throws(()=>policy.partnerCleanerDetails({...input,address:'a'.repeat(241)},company),/street address/)
})
test('cleaner email includes secure completion link without internal notes or auto-approval',()=>{
 const message=messages.partnerCleanerMessage('Alex <script>','Fixture <b>','https://example.test/cleaners/portal/claim?token=fixture',unsubscribeUrl)
 assert.match(message.text,/machinery/);assert.match(message.text,/48 hours/);assert.match(message.text,/does not approve/)
 assert.match(message.html,/Alex &lt;script&gt;/);assert.doesNotMatch(message.html,/<script>|Private call notes/)
 assert.doesNotMatch(messages.PARTNER_CLEANER_HISTORY,/token=/)
 assert.ok(message.text.includes(unsubscribeUrl));assert.ok(message.html.includes(`href="${unsubscribeUrl}"`))
 assert.match(message.html,/Unsubscribe from cleaner outreach and job broadcasts/)
 assert.match(message.html,/<h1[^>]*>Secure Cleaning<\/h1>/);assert.match(message.html,/background:#0f766e;color:#ffffff/)
 assert.match(message.html,/<html lang="en" dir="ltr">/);assert.match(message.html,/role="presentation"/)
})
test('partner receipt does not expose existing-record details or capabilities',()=>{
 for(const status of ['sent','queued','sending','failed','unknown','skipped','review_required']) {
  const receipt=policy.partnerCleanerReceipt(input.idempotencyKey,status,true)
  assert.deepEqual(Object.keys(receipt).sort(),['emailStatus','reference','replay'])
  assert.equal(receipt.emailStatus,status==='sent'?'sent':'team_review')
 }
})
test('profile completion capability is restricted to the new cleaner and registered email',()=>{
 const previous=process.env.CLEANER_PORTAL_SECRET;process.env.CLEANER_PORTAL_SECRET='synthetic-partner-cleaner-test-secret'
 try {
  const token=createCleanerPortalToken({mode:'update',email:'lead@example.test',cleanerId:'fixture-cleaner'},100000)
  const claims=verifyCleanerPortalToken(token,100001)
  assert.equal(claims.cleanerId,'fixture-cleaner');assert.equal(claims.email,'lead@example.test');assert.equal(claims.mode,'update')
  assert.equal(verifyCleanerPortalToken(token,100000+49*60*60*1000),null)
 } finally {if(previous===undefined)delete process.env.CLEANER_PORTAL_SECRET;else process.env.CLEANER_PORTAL_SECRET=previous}
})
class Rejected extends Error {}
function serviceFixture(mode='sent') {
 const sent=[],calls=[]
 const db={from(table){assert.equal(table,'cleaners');const query={select(fields){assert.equal(fields,'broadcast_unsubscribe_token');return query},eq(field,value){assert.equal(value,field==='id'?'new-cleaner':'lead@example.test');return query},async maybeSingle(){return mode==='preferences-error'?{error:{code:'connection'}}:{data:{broadcast_unsubscribe_token:mode==='missing-token'?null:unsubscribeToken}}}};return query},async rpc(name,args){calls.push({name,args});if(name==='create_partner_cleaner_intake')return mode==='revoked'?{error:{code:'42501'}}:mode==='conflict'?{error:{code:'23514'}}:{data:{created:!mode.startsWith('replay'),emailStatus:mode==='duplicate'?'review_required':mode==='replay-sent'?'sent':'queued'}};
 if(name==='claim_partner_cleaner_email')return {data:mode==='claim-lost'?null:{cleanerId:'new-cleaner',email:'lead@example.test',firstName:'Manager',businessName:'Fixture Cleaning'}};
 return mode==='completion-error'?{error:{code:'connection'}}:{data:null}}}
 const service=moduleWithMocks('src/lib/partnerCleanerCreate.ts',{'node:crypto':crypto,'./partnerCleanerWelcome':{sendPartnerCleanerWelcome:async(_actor,_id,status)=>status},'./supabase':{getAdminSupabase:()=>db},'./siteUrl':{getSiteUrl:()=> 'https://example.test'},'./partnerBookingPolicy':bookingPolicy,'./partnerCleanerPolicy':policy,'./cleanerServiceAreas':{defaultCleanerServiceAreas},'./cleanerPortal':{createCleanerPortalLink:({cleanerId,email})=>`https://example.test/claim?token=${cleanerId}:${email}`},'./partnerCleanerMessage':messages,'./emailFailureAlerts':{reportEmailFailure:async()=>{}},'./email':{EmailProviderRejectedError:Rejected,sendEmailOrThrow:async(payload,options)=>{sent.push({payload,options});if(mode==='failed')throw new Rejected();if(mode==='unknown')throw new Error('unknown');return {id:'provider-id'}}}})
 return {service,sent,calls}
}
test('new intake sends exactly to the saved cleaner and uses an idempotency key; sender notes remain private',async()=>{
 const {service,sent,calls}=serviceFixture()
 const result=await service.createPartnerCleaner(actor,input)
 assert.equal(result.emailStatus,'sent');assert.equal(sent.length,1);assert.equal(sent[0].payload.to,'lead@example.test')
 assert.equal(sent[0].payload.cc,undefined);assert.equal(sent[0].options.idempotencyKey,`partner-cleaner/${input.idempotencyKey}`)
 assert.doesNotMatch(sent[0].payload.text,/Private call notes/);assert.match(sent[0].payload.text,/token=new-cleaner/)
 assert.equal(calls[0].args.p_inputs.firstName,'Manager');assert.equal(calls[0].args.p_session_version,'version')
 assert.equal(calls.at(-1).args.p_outcome,'sent');assert.equal(calls.at(-1).args.p_provider_id,'provider-id')
 assert.equal(sent[0].payload.headers['List-Unsubscribe'],`<https://example.test/api/cleaner-email-preferences/unsubscribe?token=${unsubscribeToken}>`)
 assert.equal(sent[0].payload.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click')
 assert.ok(sent[0].payload.text.includes(unsubscribeUrl))
 assert.equal(result.unsubscribeToken,undefined)
})
test('cleaner invitation is not sent when a working unsubscribe link cannot be prepared',async()=>{
 for(const mode of ['missing-token','preferences-error']) {
  const {service,sent,calls}=serviceFixture(mode)
  assert.equal((await service.createPartnerCleaner(actor,input)).emailStatus,'team_review')
  assert.equal(sent.length,0);assert.equal(calls.at(-1).args.p_outcome,'failed')
 }
})
test('duplicates, replays, revoked access and lost delivery claims do not send',async()=>{
 for(const mode of ['duplicate','replay-sent','claim-lost','revoked','conflict']) {
  const {service,sent}=serviceFixture(mode)
  if(['revoked','conflict'].includes(mode)) await assert.rejects(()=>service.createPartnerCleaner(actor,input))
  else await service.createPartnerCleaner(actor,input)
  assert.equal(sent.length,0,mode)
 }
})
test('failed or uncertain email retains the new lead and returns team review, not success or resend',async()=>{
 for(const mode of ['failed','unknown','completion-error']) {
  const {service,sent,calls}=serviceFixture(mode)
  const result=await service.createPartnerCleaner(actor,input)
  assert.equal(result.emailStatus,'team_review');assert.equal(sent.length,1)
  assert.equal(calls.filter(c=>c.name==='create_partner_cleaner_intake').length,1)
  assert.equal(calls.at(-1).args.p_outcome,mode==='completion-error'?'sent':mode)
 }
})
test('cleaner route rejects cross-origin/oversize/unauthenticated/throttled requests before mutation',async()=>{
 for(const mode of ['cross-origin','oversize','unauthenticated','throttled','ok']) {
  const calls=[]
  const route=moduleWithMocks('src/app/api/partner-booking/cleaners/route.ts',{'next/server':{},'@/lib/partnerBookingAuth':{getPartnerActor:async()=>{if(mode==='unauthenticated')throw new Error('login');return actor}},'@/lib/partnerCleanerCreate':{createPartnerCleaner:async()=>{calls.push('mutation');return {ok:true}}},'@/lib/partnerBookingHttp':{partnerJson:x=>x,partnerFailure:()=>({error:'safe'})},'@/lib/abuseProtection':{rejectCrossOriginMutation:()=>mode==='cross-origin'?{blocked:true}:null,rejectLargePayload:async()=>mode==='oversize'?{blocked:true}:null,rateLimitValue:async()=>mode==='throttled'?{blocked:true}:null}})
  await route.POST({json:async()=>input});assert.equal(calls.length,mode==='ok'?1:0,mode)
 }
})
