import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
import {smsSegments} from '../src/lib/smsPolicy.ts'
function compile(source,deps={},globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,Date,Intl,console:{error(){},warn(){}},process:{env:{}},require(name){if(name==='server-only')return{};if(!(name in deps))throw Error('Unexpected '+name);return deps[name]},...globals});return exports
}
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function receiptFixture({error=null,data=true,alertError=false}={}){
 const calls=[],alerts=[]
 const module=compile(file('src/lib/inspectionSms.ts'),{'./supabase':{getAdminSupabase:()=>({rpc:async(...args)=>{calls.push(args);return{data,error}}})},'./smsAlerts':{smsAlert:async(...args)=>{alerts.push(args);if(alertError)throw Error('alert unavailable')}}})
 return{module,calls,alerts}
}
const input={entityType:'booking',entityRef:'BK-1',kind:'confirmation',phone:'0412345678',email:'client@example.test',snapshot:{date:'2099-01-01'},providerMessageId:'accepted-id'}
test('inspection receipt requires provider acceptance and never turns SMS failure into an email retry',async()=>{
 for(const providerMessageId of [undefined,null,'',' ']){const f=receiptFixture();await f.module.recordInspectionEmailSms({...input,providerMessageId});assert.equal(f.calls.length,0);assert.equal(f.alerts.length,1)}
 for(const opts of [{error:Error('PRIVATE')},{data:false},{error:Error('PRIVATE'),alertError:true}]){const f=receiptFixture(opts);await assert.doesNotReject(f.module.recordInspectionEmailSms(input));assert.equal(f.alerts[0][0],'inspection_sms_queue_failed');assert.doesNotMatch(JSON.stringify(f.alerts),/PRIVATE|client@example|041234/)}
 const f=receiptFixture();await f.module.recordInspectionEmailSms(input);assert.equal(f.calls[0][0],'sms_record_inspection_email');assert.equal(f.calls[0][1].p_provider_message_id,'accepted-id');assert.equal(f.alerts.length,0)
})
test('booking snapshots preserve appointment identity and never contain internal notes',()=>{
 const f=receiptFixture();const snapshot=f.module.bookingSmsSnapshot({preferredStartDate:'2099-01-01',preferredInspectionStartTime:'10:00',preferredInspectionEndTime:'10:10',preferredInspectionAssigneeId:'assigned',inspectionBookingSource:'partner',notes:'PRIVATE',requestedInspectionTimes:[{date:'2099-01-01',startTime:'10:00'}]})
 assert.equal(snapshot.assignee,'assigned');assert.equal(snapshot.date,'2099-01-01');assert.equal(snapshot.proposals.length,1);assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE|notes/)
})
function emailFixture(failRecipient){
 const sends=[],receipts=[];const snapshot=receiptFixture().module.bookingSmsSnapshot
 const module=compile(file('src/lib/email.ts'),{'@/content/quote-service-terms-pdf.json':{},'./quoteTerms':{},'@/lib/htmlEscape':{escapeHtml:v=>String(v??'')},'@/lib/richEmailServer':{},'./quoteEngine':{},'./calendarInvite':{buildBookingInviteIcs:()=> 'ICS'},'./siteUrl':{getSiteUrl:()=> 'https://fixture.invalid'},'./publicRoomScope':{},'./availability':{getAvailabilityConfig:async()=>({}),getAvailabilityAssignee:()=>({email:'agent@example.test'})},'./quoteBookingAccess':{},'./quoteEmailRecipients':{},'./emailFailureAlerts':{reportEmailFailure:async()=>{}},'./inspectionSms':{bookingSmsSnapshot:snapshot,recordInspectionEmailSms:async x=>receipts.push(x)},resend:{Resend:class{emails={send:async payload=>{sends.push(payload);return sends.length===failRecipient?{error:{message:'Rejected'}}:{data:{id:'accepted-'+sends.length}}}}}}},{process:{env:{RESEND_API_KEY:'fixture'}}})
 return{module,sends,receipts}
}
const booking={businessName:'Example',contactName:'Casey',email:'client@example.test',phone:'0412345678',city:'sydney',address:'1 Example Street',suburb:'Sydney',postcode:'2000',frequency:'weekly',timePreference:'after_hours',preferredStartDate:'2099-01-01',preferredInspectionAssigneeId:'agent',inspectionBookingSource:'partner'}
test('initial visit SMS records only accepted client email, even if the staff email then fails',async()=>{
 for(const source of ['partner','crm_manual',undefined]){const f=emailFixture();await f.module.sendBookingConfirmationEmail('BK-1',{...booking,inspectionBookingSource:source});assert.equal(f.receipts.length,1);assert.equal(f.receipts[0].providerMessageId,'accepted-1');assert.equal(f.receipts[0].kind,source?'confirmation':'request')}
 const rejected=emailFixture(1);await assert.rejects(rejected.module.sendBookingConfirmationEmail('BK-1',booking));assert.equal(rejected.receipts.length,0)
 const staffRejected=emailFixture(2);await assert.rejects(staffRejected.module.sendBookingConfirmationEmail('BK-1',booking));assert.equal(staffRejected.receipts.length,1)
})
test('partner request and confirmation SMS follow client acceptance; declines and previews never queue',async()=>{
 for(const state of ['pending','confirmed','declined']){
  for(const rejectClient of [false,true]){
   const receipts=[],sends=[];const mod=compile(file('src/lib/partnerAppointmentMessages.ts'),{'./htmlEscape':{escapeHtml:v=>String(v??'')},'./ics':{escapeIcsText:v=>v,serializeIcs:()=> 'ICS'},'./calendarInvite':{getDateTimeInTimeZone:()=>new Date('2099-01-01T00:00Z'),getCityTimeZone:()=> 'Australia/Sydney',buildBookingInviteIcs:()=> 'ICS'},'./siteUrl':{getSiteUrl:()=> 'https://fixture.invalid'},'./emailFailureAlerts':{reportEmailFailure:async()=>{}},'./email':{sendEmailOrThrow:async p=>{sends.push(p);if(rejectClient&&sends.length===2)throw Error('Rejected');return{id:'accepted-'+sends.length}}},'./inspectionSms':{bookingSmsSnapshot:()=>({}),recordInspectionEmailSms:async x=>receipts.push(x)}})
   const notice={bookingRef:'BK-1',requestId:'request',inputs:booking,agentEmail:'agent@example.test',state,selected:state==='confirmed'?0:null,proposals:[{date:'2099-01-01',startTime:'10:00'}]}
   mod.partnerAppointmentPayloads(notice);assert.equal(sends.length+receipts.length,0)
   await mod.sendPartnerAppointmentNotice(notice).catch(()=>{})
   assert.equal(receipts.length,!rejectClient&&state!=='declined'?1:0)
   if(receipts.length)assert.equal(receipts[0].providerMessageId,'accepted-2')
  }
 }
})
function saleFixture(failRecipient){
 const receipts=[],sends=[]
 const data={contract_sale_invoices:[{id:'invoice',invoice_type:'sale',deposit_required_inc_gst_cents:50000}],contract_sale_inspections:null,contract_sale_payment_allocations:[{amount_cents:50000}],contract_sale_agreements:{id:'agreement'}}
 const db={from(table){let mutation='';const q=new Proxy({},{get(_,name){if(name==='then')return resolve=>resolve({data:mutation==='upsert'?{id:'inspection'}:mutation==='update'||mutation==='insert'?null:data[table],error:null});return()=>{if(['update','upsert','insert'].includes(name))mutation=name;return q}}});return q}}
 const all=file('src/lib/contractSales.ts'),start=all.indexOf('export async function scheduleContractSaleInspection('),end=all.indexOf('export async function completeContractSaleInspection(',start)
 class Rejected extends Error{}
 const globals={getAuthorizedSale:async()=>({id:'sale',sale_code:'PS-1'}),getAdminSupabase:()=>db,CONTRACT_SALE_DEPOSIT_INC_GST_CENTS:50000,ContractProductError:Error,assertDate:v=>v,clean:(v)=>String(v??''),normalizeInvoiceEmail:v=>v,loadSaleContext:async()=>({client:{email:'client@example.test',phone:'0412345678',contact_name:'Client'},cleaner:{email:'cleaner@example.test',phone:'0499999999',contact_name:'Cleaner',business_name:'Cleaner'},product:{state:'NSW'},site:{site_name:'Example'}}),inspectionTimeZone:()=> 'Australia/Sydney',getDateTimeInTimeZone:()=>new Date('2099-01-01T00:00Z'),previewContractSaleInspectionConfirmations:async()=>({fingerprint:'preview',client:{subject:'Client',html:'Client',bodyText:'Client'},cleaner:{subject:'Cleaner',html:'Cleaner',bodyText:'Cleaner'}}),parseInspectionEmailDraft:()=>({bodyDocument:null}),inspectionIcs:()=> 'ICS',getAvailabilityConfig:async()=>({}),getAvailabilityAssignee:()=>({}),getAvailabilityCalendarFeedKey:()=> 'fixture-feed',upsertContractSaleInspectionEvent:async()=>({status:'sent'}),escapeHtml:v=>String(v??''),EmailProviderRejectedError:Rejected,recordInspectionEmailSms:async x=>receipts.push(x),writeAuditLogStrict:async()=>{},actorAudit:()=>({}),sendEmailOrThrow:async p=>{sends.push(p);if(p.to===failRecipient)throw new Rejected('Rejected');return{id:'accepted-'+sends.length}}}
 const mod=compile(all.slice(start,end),{},globals)
 return{mod,receipts,sends}
}
test('purchasing-cleaner inspection sends SMS only for the accepted CLIENT invitation, never cleaner or staff',async()=>{
 const actor={id:'staff',email:'agent@example.test',displayName:'Agent'},request={saleId:'sale',date:'2099-01-01',time:'10:00',durationMinutes:60,location:'Example',previewFingerprint:'preview',clientRequestId:'11111111-1111-4111-8111-111111111111',cleanerRequestId:'22222222-2222-4222-8222-222222222222'}
 for(const rejected of [undefined,'client@example.test','cleaner@example.test']){const f=saleFixture(rejected);await f.mod.scheduleContractSaleInspection(actor,request).catch(e=>{if(!rejected)throw e});assert.equal(f.receipts.length,rejected==='client@example.test'?0:1);if(f.receipts.length){assert.equal(f.receipts[0].phone,'0412345678');assert.equal(f.receipts[0].entityType,'sale_inspection');assert.equal(f.receipts[0].providerMessageId,'accepted-1')}}
})
test('fixed appointment SMS messages remain one segment and include opt-out wording',()=>{
 const sql=file('supabase/migrations/20261116231302_inspection_email_sms.sql')
 const messages=[...sql.matchAll(/'Secure Cleaning: (.*?)'/g)].length // SQL escaped apostrophes need explicit extraction below.
 assert.ok(messages>0)
 for(const text of sql.matchAll(/'((?:Secure Cleaning: )(?:(?:'')|[^'])*)'/g)){const message=text[1].replaceAll("''", "'");assert.equal(smsSegments(message).segments,1);assert.match(message,/Reply STOP to opt out\.$/)}
})
