import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as ts from 'typescript'
import * as crypto from 'node:crypto'
import * as net from 'node:net'
import { csvCell } from '../src/lib/csvCell.ts'
import { escapeHtml } from '../src/lib/htmlEscape.ts'
const env = { ADMIN_SESSION_SECRET: 'synthetic-independent-secret-32-bytes-long', AVAILABILITY_AGENT_SIGNING_SECRET: 'synthetic-independent-agent-secret-32-bytes', VERCEL: '1' }
function load(path, dependencies={}, vars=env) {
  const exports={}
  const source=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(source,{exports,require:name=> {
    if(name==='server-only')return {}
    if(name==='node:crypto')return crypto
    if(name==='node:net')return net
    if(!(name in dependencies))throw new Error('Missing mock '+name)
    return dependencies[name]
  },process:{env:vars},Buffer,URL,URLSearchParams,Date,console:{error(){},warn(){}},setTimeout,clearTimeout})
  return exports
}
const response={NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}}
function queryFixture(tables) {
  return {from(table){
    const filters=[];let mode='read';let payload
    const query={select(){return query},eq(key,value){filters.push(row=>row[key]===value);return query},is(key,value){filters.push(row=>(row[key]??null)===value);return query},gt(key,value){filters.push(row=>row[key]>value);return query},
      insert(value){mode='insert';payload=value;return query},
      async maybeSingle(){return query.run()},async single(){return query.run()},
      async run(){if(mode==='insert'){tables[table]??=[];tables[table].push(payload);return {data:payload,error:null}}return {data:(tables[table]??[]).find(row=>filters.every(f=>f(row)))??null,error:null}},
      then(resolve,reject){return query.run().then(resolve,reject)}}
    return query
  }}
}

test('current staff authority fails closed after deletion, deactivation, role, region, password or session revision changes',async()=>{
  let account={id:'staff',username:'one',role:'owner',active:true,password_hash:'synthetic',availability_assignee_id:'north',session_version:'one'}
  const auth=load('src/lib/adminAuth.ts',{'next/headers':{},'next/server':{},'@/lib/staffAccounts':{getStaffAccountById:async()=>account}})
  const original={...account};const token=await auth.createAdminSessionToken(account)
  assert.equal((await auth.getAdminSessionIdentity(token)).role,'owner')
  for(const change of [null,{active:false},{role:'viewer'},{availability_assignee_id:'south'},{password_hash:'reset'},{session_version:'two'},{username:'renamed'}]){
    account=change===null?null:{...original,...change}
    assert.equal(await auth.getAdminSessionIdentity(token),null)
  }
  account={...original};assert.equal(await auth.getAdminSessionIdentity(token+'.extra'),null)
  account={...original,role:'agent'};const agentToken=await auth.createAdminSessionToken(account)
  const req={cookies:{get:()=>({value:agentToken})},method:'POST'}
  assert.equal(await auth.isAuthorizedAdminRequest(req),false)
  account=null;assert.equal(await auth.isAuthorizedAdminRequest(req,'agent'),false)
  const outage=load('src/lib/adminAuth.ts',{'next/headers':{},'next/server':{},'@/lib/staffAccounts':{getStaffAccountById:async()=>{throw Error('offline')}}})
  assert.equal(await outage.getAdminSessionIdentity(token),null)
})

test('agent tokens need independent signing material and enforce purpose, expiry and revocation input',()=>{
  const dependencies={'next/headers':{},'@/lib/adminAuth':{},'@/lib/staffAccounts':{},'@/lib/availability':{},'@/lib/availabilityAccessCode':{}}
  const auth=load('src/lib/availabilityAgentAuth.ts',dependencies)
  const session=auth.createAvailabilityAgentSessionToken('agent','old-exposed-hash')
  const feed=auth.createAvailabilityAgentFeedToken('agent','old-exposed-hash')
  assert.equal(auth.isValidAvailabilityAgentSessionToken(session,'agent','old-exposed-hash'),true)
  assert.equal(auth.isValidAvailabilityAgentFeedToken(feed,'agent','old-exposed-hash'),true)
  for(const [token,id,hash] of [[feed,'agent','old-exposed-hash'],[session,'other','old-exposed-hash'],[session,'agent','rotated'],[session+'.extra','agent','old-exposed-hash']])assert.equal(auth.isValidAvailabilityAgentSessionToken(token,id,hash),false)
  assert.equal(auth.isValidAvailabilityAgentFeedToken(session,'agent','old-exposed-hash'),false)
  const payload=Buffer.from(JSON.stringify({v:1,a:'agent',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')
  const forged=payload+'.'+crypto.createHmac('sha256','securecleaning-availability-agent:agent:old-exposed-hash').update(payload).digest('base64url')
  assert.equal(auth.isValidAvailabilityAgentSessionToken(forged,'agent','old-exposed-hash'),false)
  assert.equal(load('src/lib/availabilityAgentAuth.ts',dependencies,{}).createAvailabilityAgentSessionToken('agent','hash'),null)
})

test('random quote capabilities are hash-only, purpose/quote/version-bound, expiring and revocable',async()=>{
  const tables={quotes:[{id:'q1',quote_ref:'SC-TEST',client_id:'c1',inputs:{},final_quote_document_version:1,final_quote_sent_at:'2026-10-01',final_quote_reviewed_at:'2026-09-30'}]}
  const access=load('src/lib/quoteBookingAccess.ts',{'@/lib/supabase':{getAdminSupabase:()=>queryFixture(tables)}})
  const token=await access.createQuoteCapability('SC-TEST','document','final')
  assert.match(token,/^[A-Za-z0-9_-]{43}$/)
  assert.equal(JSON.stringify(tables).includes(token),false)
  assert.ok(await access.resolveQuoteCapability('SC-TEST',token,'document','final'))
  assert.equal(await access.resolveQuoteCapability('SC-OTHER',token,'document','final'),null)
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'booking','final'),null)
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','remote_review'),null)
  tables.quotes[0].final_quote_reviewed_at='2026-10-02'
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','final'),null)
  tables.quotes[0].final_quote_reviewed_at='2026-09-30'
  tables.quotes[0].final_quote_document_version=2
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','final'),null)
  tables.quotes[0].final_quote_document_version=1;tables.quotes[0].final_quote_sent_at=null
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','final'),null)
  tables.quotes[0].final_quote_sent_at='2026-10-01';tables.quote_capabilities[0].revoked_at='now'
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','final'),null)
  tables.quote_capabilities[0].revoked_at=null;tables.quote_capabilities[0].expires_at='2000-01-01'
  assert.equal(await access.resolveQuoteCapability('SC-TEST',token,'document','final'),null)
})

test('limiter ignores spoofable identity headers, shares RPC counters and fails closed on outage',async()=>{
  const calls=[];let count=0;let offline=false
  const abuse=load('src/lib/abuseProtection.ts',{'next/server':response,'@/lib/supabase':{getAdminSupabase:()=>({rpc:async(name,args)=>{calls.push(args);return offline?{error:{}}:{data:{allowed:++count<=2,retry_after:60}}}})}})
  const req=headers=>({headers:new Headers({'x-vercel-forwarded-for':'192.0.2.1',...headers})})
  const policy={key:'test',limit:2,windowMs:60000}
  assert.equal(await abuse.rateLimit(req({'user-agent':'one','cf-connecting-ip':'1.1.1.1'}),policy),null)
  assert.equal(await abuse.rateLimit(req({'user-agent':'two','x-forwarded-for':'2.2.2.2'}),policy),null)
  assert.equal((await abuse.rateLimit(req({'user-agent':'three'}),policy)).status,429)
  assert.equal(new Set(calls.map(x=>x.p_subject)).size,1)
  offline=true;assert.equal((await abuse.rateLimit(req({}),policy)).status,503)
})

test('linked booking denials happen before customer/site mutations and email/calendar effects',async()=>{
  const effects=[];let authorized=null
  const module=load('src/app/api/booking/route.ts',{
    'next/server':response,
    '@/lib/quoteBookingAccess':{resolveQuoteCapability:async()=>authorized,quoteCapabilityHash:()=>''},
    '@/lib/supabase':{getAdminSupabase:()=>{effects.push('db');throw Error('unexpected db')}},
    '@/lib/email':{sendBookingConfirmationEmail:async()=>effects.push('email')},
    '@/lib/googleCalendar':{createBookingFollowUpEvent:async()=>effects.push('calendar')},
    '@/lib/clientCrmData':{ClientCrmError:class extends Error{},resolvePublicSubmissionClient:async()=>effects.push('client'),syncBookingCrmOpportunity:async()=>effects.push('crm')},
    '@/lib/availability':{},'@/lib/calendarInvite':{},'@/lib/siteMatching':{},'@/lib/addressGeocoding':{},
    '@/lib/abuseProtection':Object.fromEntries(['limitString','rateLimit','rateLimitValue','rejectCrossOriginMutation','rejectLargePayload','validatePublicSubmission'].map(name=>[name,()=>null])),
  })
  for(const handoff of [undefined,'malformed','expired','wrong-purpose']){
    const result=await module.POST({json:async()=>({quoteRef:'SC-TEST',handoff})})
    assert.equal(result.status,404)
  }
  authorized={quote:{id:'q1',client_id:'c1',inputs:{email:'client@example.test',phone:'0400000000'}}}
  for(const change of [{email:'attacker@example.test',phone:'0400000000'},{email:'client@example.test',phone:'invalid'}]){
    assert.equal((await module.POST({json:async()=>({quoteRef:'SC-TEST',handoff:'valid',...change})})).status,400)
  }
  assert.deepEqual(effects,[])
})

test('CSV text encoding neutralizes formulas including whitespace/control prefixes and round-trips quotes',()=>{
  const decode=value=>value.slice(1,-1).replaceAll('""','"')
  for(const value of ['=1+1','+CMD','-2+3','@SUM(A1)','  =1','\t=1','\r\n@cmd','\u0000+cmd'])assert.equal(decode(csvCell(value)),"'"+value)
  for(const value of ['Jane','O"Brien, Example','line one\nline two','José'])assert.equal(decode(csvCell(value)),value)
  assert.equal(decode(csvCell(['=1','two'])),"'=1; two")
})

test('HTML text encoding preserves content without rendering injected elements or attributes',()=>{
  assert.equal(escapeHtml('<img src="x" onerror="bad">&'), '&lt;img src=&quot;x&quot; onerror=&quot;bad&quot;&gt;&amp;')
})

test('generic jobs interest stays unverified; verified portal identity cannot select another cleaner', async()=>{
  const records=[];const cleanerReads=[];const sent=[]
  const db={from(table){let payload;const filters={};let mode='read';const q={
    select(){return q},eq(key,value){filters[key]=value;return q},
    insert(value){payload=value;mode='insert';return q},upsert(value){payload=value;mode='insert';return q},update(value){payload=value;mode='update';return q},
    async maybeSingle(){return q.run()},async single(){return q.run()},
    async run(){
      if(mode==='insert'){records.push({table,...payload});return {data:{id:'synthetic-'+records.length},error:null}}
      if(mode==='update')return {data:{id:'synthetic'},error:null}
      if(table==='contract_products')return {data:{id:'product',product_code:'C-TEST',heading:'Office',state:'NSW',suburb:'Sydney',assigned_staff_id:null}}
      if(table==='cleaners'){cleanerReads.push(filters);return {data:filters.id==='cleaner-a'&&filters.email==='a@example.test'?{id:'cleaner-a',email:'a@example.test',state:'NSW',status:'approved',contact_name:'Cleaner A'}:null}}
      return {data:null,error:null}
    },then(resolve,reject){return q.run().then(resolve,reject)}};return q
  }}
  const interest=load('src/lib/contractProductInterest.ts',{
    '@/lib/supabase':{getAdminSupabase:()=>db},'@/lib/email':{EmailProviderRejectedError:class extends Error{},sendEmailOrThrow:async mail=>{sent.push(mail);return {id:'mail'}}},
    '@/lib/siteUrl':{getSiteUrl:()=> 'https://example.test'},'@/lib/contractProducts':{getJobsAccessLink:async()=>({state:'NSW'})},
  })
  await interest.registerContractProductInterest({productCode:'C-TEST',accessLinkId:'generic',email:'a@example.test'})
  assert.equal(cleanerReads.length,0)
  assert.equal(records.find(r=>r.table==='contract_product_interests').cleaner_id,null)
  assert.equal(records.find(r=>r.table==='contract_product_interests').match_status,'unmatched')
  assert.equal(sent.some(mail=>mail.to==='a@example.test'),false)
  records.length=0;sent.length=0
  await interest.registerContractProductInterest({productCode:'C-TEST',accessLinkId:'generic',email:'b@example.test',identity:{mode:'update',cleanerId:'cleaner-a',email:'a@example.test'}})
  assert.equal(records.find(r=>r.table==='contract_product_interests').cleaner_id,'cleaner-a')
  assert.equal(records.find(r=>r.table==='contract_product_interests').email_normalized,'a@example.test')
  assert.equal(sent.some(mail=>mail.to==='b@example.test'),false)
  assert.equal(sent.some(mail=>mail.to==='a@example.test'),true)
  records.length=0
  await interest.registerContractProductInterest({productCode:'C-TEST',accessLinkId:'generic',email:'b@example.test',identity:{mode:'update',cleanerId:'cleaner-b',email:'a@example.test'}})
  assert.equal(records.length,0)
})

test('quote and scope document helpers deny before loading pricing or protected quote content',async()=>{
  let reads=0
  const workflow=load('src/lib/quoteWorkflowData.ts',{
    '@/lib/quoteStaffAccess':{canStaffAccessQuote:async()=>false},'@/lib/quoteBookingAccess':{resolveQuoteCapability:async()=>null},
    '@/lib/supabase':{getAdminSupabase:()=>{reads++;throw Error('unexpected read')}},'@/lib/quoteWorkflow':{},
    '@/lib/pricing':{getQuotePricingConfig:async()=>{reads++;throw Error('unexpected read')}},
    '@/lib/roomTypeConfig':{getQuoteRoomTypeConfig:async()=>{reads++;throw Error('unexpected read')}},
    '@/lib/scopeOfWorks':{},'@/lib/publicQuoteDocument':{},'@/lib/quoteCustomerJourney':{},
  })
  assert.equal(await workflow.getPublicQuoteDocumentByRef('SC-TEST','remote_review'),null)
  assert.equal(await workflow.getPublicScopeDocumentByRef('SC-TEST','final','invalid'),null)
  assert.equal(reads,0)
})
