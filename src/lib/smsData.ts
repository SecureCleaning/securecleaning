import 'server-only'
import { createHmac, randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getAdminSupabase } from './supabase'
import { getClientCrmActor, type ClientCrmActor } from './clientCrmAuth'
import { getAvailabilityConfig } from './availability'
import { canAvailabilityAgentAccessQuote } from './clientCrmQuoteAccess'
import { getQuoteWorkflowByRef } from './quoteWorkflowData'
import { normalizeSmsMobile, renderSms, smsSegments, smsTimeZone, nextSmsSendTime, SMS_TERMINAL_QUOTE_STATES, type SmsSettings } from './smsPolicy'
import { secureTokenMatch, smsLiveEnabled } from './mobileMessage'
export class SmsError extends Error { constructor(message: string, readonly status=400) { super(message) } }
export async function smsActor(request: NextRequest) {
  const actor = await getClientCrmActor(request)
  if (!actor) throw new SmsError('Staff sign-in required.',403)
  return actor
}
export function requireSmsOwner(actor: ClientCrmActor) {
  if (actor.role!=='owner') throw new SmsError('Owner access required.',403)
}
export async function smsQuote(actor: ClientCrmActor, ref: string) {
  const quote = await getQuoteWorkflowByRef(ref)
  if (!quote || (actor.role==='agent' && (!actor.availabilityAssigneeId || !await canAvailabilityAgentAccessQuote(await getAvailabilityConfig(),actor.availabilityAssigneeId,quote)))) throw new SmsError('Quote not found.',404)
  return quote
}
export async function smsSettings() {
  const {data,error}=await getAdminSupabase().from('sms_settings').select('auto_enabled,delay_minutes,template,alert_email,low_credit_threshold,credit_price_cents,max_parts,health,worker_at,webhook_at,inbound_checked_at,updated_at').eq('id',true).single()
  if(error) throw new SmsError('SMS setup is not yet installed. No messages have been sent.',503)
  return data as SmsSettings & {health: Record<string,unknown>; worker_at: string|null; webhook_at:string|null; inbound_checked_at:string; updated_at:string}
}
export async function saveSmsSettings(actor:ClientCrmActor,body:Record<string,unknown>) {
  requireSmsOwner(actor)
  const next = { auto_enabled: body.auto_enabled===true, delay_minutes:Number(body.delay_minutes),template:String(body.template||''),alert_email:String(body.alert_email||'').trim().toLowerCase(),low_credit_threshold:Number(body.low_credit_threshold),credit_price_cents:Number(body.credit_price_cents),max_parts:Number(body.max_parts),updated_at:new Date().toISOString() }
  try { renderSms(next.template,{first_name:'Client',client_name:'Client',quote_reference:'SC-EXAMPLE'}) } catch(error) {throw new SmsError(error instanceof Error?error.message:'Invalid SMS template.')}
  if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(next.alert_email)||next.alert_email.length>254) throw new SmsError('Enter one valid alert email address.')
  if(!Number.isInteger(next.delay_minutes)||next.delay_minutes<0||next.delay_minutes>120||!Number.isInteger(next.low_credit_threshold)||next.low_credit_threshold<0||!Number.isFinite(next.credit_price_cents)||next.credit_price_cents<0||next.credit_price_cents>100||!Number.isInteger(next.max_parts)||next.max_parts<1||next.max_parts>5) throw new SmsError('Check the delay, credit threshold, price and segment limit.')
  if(next.auto_enabled) {
    const current=await smsSettings()
    if(!smsLiveEnabled()||current.health.ready!==true||!current.worker_at||Date.now()-Date.parse(current.worker_at)>5*60_000) throw new SmsError('Enable the server and check the connection and scheduler before activating automatic SMS.',409)
  }
  const db=getAdminSupabase()
  const {data,error}=await db.rpc('sms_save_settings',{p_previous:String(body.updated_at),p_values:next,p_actor:actor.id})
  if(error) throw error
  if(!data) throw new SmsError('Settings changed. Reload before saving.',409)
}
export async function quoteSmsHistory(actor:ClientCrmActor,ref:string) {
  const quote=await smsQuote(actor,ref), db=getAdminSupabase()
  const mobile=normalizeSmsMobile(quote.finalDocument?.inputs.phone || quote.inputs.phone)
  const [jobs,pref,request]=await Promise.all([
    db.from('sms_jobs').select('id,purpose,mobile,message,status,reason,due_at,created_at,submitted_at,credits,cancel_requested').eq('quote_ref',ref).order('created_at',{ascending:false}).limit(50),
    mobile? db.from('sms_preferences').select('consent,opted_out,updated_at').eq('mobile',mobile).maybeSingle():Promise.resolve({data:null,error:null}),
    mobile? db.from('sms_quote_requests').select('source,allowed,recorded_at,notice_version').eq('quote_ref',ref).eq('mobile',mobile).maybeSingle():Promise.resolve({data:null,error:null}),
  ])
  if(jobs.error||pref.error||request.error) throw jobs.error||pref.error||request.error
  const ids=(jobs.data||[]).map(j=>j.id)
  const replies=ids.length?await db.from('sms_replies').select('id,message,received_at,read_at,opted_out').in('job_id',ids).order('received_at',{ascending:false}).limit(50):{data:[],error:null}
  if(replies.error) throw replies.error
  return {mobile,preference:pref.data,quoteRequest:request.data,jobs:jobs.data,replies:replies.data,template:(await smsSettings()).template}
}
export async function setSmsPreference(actor:ClientCrmActor,ref:string,body:Record<string,unknown>) {
  const quote=await smsQuote(actor,ref), mobile=normalizeSmsMobile(quote.finalDocument?.inputs.phone||quote.inputs.phone)
  if(!mobile) throw new SmsError('A valid Australian mobile number is required.')
  const evidence=String(body.evidence||'').trim()
  if(evidence.length<10||evidence.length>1000) throw new SmsError('Record how and when SMS permission was obtained or withdrawn (10-1000 characters).')
  const db=getAdminSupabase(), {data:existing,error}=await db.from('sms_preferences').select('opted_out').eq('mobile',mobile).maybeSingle()
  if(error) throw error
  const consent=body.consent===true
  if(existing?.opted_out&&consent) throw new SmsError('This number opted out. Owner review and provider re-subscription are required before recording renewed permission.',409)
  const result=await db.rpc('sms_save_preference',{p_mobile:mobile,p_consent:consent,p_evidence:evidence,p_actor:actor.id,p_quote_ref:ref})
  if(result.error) throw result.error
  if(!result.data) throw new SmsError('This number has opted out. Owner review is required.',409)
}
function signPreview(value:string) {
  const secret=process.env.ADMIN_SESSION_SECRET
  if(!secret) throw new SmsError('SMS preview signing is unavailable.',503)
  return createHmac('sha256',secret).update(value).digest('hex')
}
export async function prepareSms(actor:ClientCrmActor,body:Record<string,unknown>) {
  const settings=await smsSettings(), test=body.test===true
  let ref:string|null=null, version:number|null=null, fields:Record<string,string>, mobile:string|null, zone:string|null
  if(test) {
    requireSmsOwner(actor);mobile=normalizeSmsMobile(body.mobile);zone=smsTimeZone(body.city||'sydney');fields={first_name:'Test',client_name:'Test recipient',quote_reference:'TEST'}
  } else {
    ref=String(body.quoteRef||'');const quote=await smsQuote(actor,ref)
    if((quote.validUntil&&Date.parse(quote.validUntil)<Date.now())||!quote.finalDocument||SMS_TERMINAL_QUOTE_STATES.includes(quote.status)||SMS_TERMINAL_QUOTE_STATES.includes(quote.firmQuoteDraft.status)) throw new SmsError('An active final quote is required.')
    version=quote.finalDocument.version;mobile=normalizeSmsMobile(quote.finalDocument.inputs.phone);zone=smsTimeZone(quote.finalDocument.inputs.city)
    const db=getAdminSupabase(), {data:attempt,error}=await db.from('quote_send_attempts').select('id').eq('quote_ref',ref).eq('document_version',version).in('status',['provider_accepted','finalized']).not('provider_message_id','is',null).limit(1)
    if(error) throw error
    if(!attempt?.length) throw new SmsError('The final quote email has not been confirmed as submitted.')
    const pref=mobile?await db.from('sms_preferences').select('consent,opted_out').eq('mobile',mobile).maybeSingle():{data:null,error:null}
    if(pref.error) throw pref.error
    if(!pref.data?.consent||pref.data.opted_out) throw new SmsError('SMS permission is missing or this number has opted out.')
    const request=await db.from('sms_quote_requests').select('allowed').eq('quote_ref',ref).eq('mobile',mobile).maybeSingle()
    if(request.error) throw request.error
    if(request.data?.allowed===false) throw new SmsError('The client requested email-only contact for this quote.')
    const name=quote.finalDocument.inputs.contactName||'';fields={first_name:name.split(' ')[0],client_name:name,quote_reference:ref}
  }
  if(!mobile||!zone) throw new SmsError('Confirm an Australian mobile number and client service region.')
  const template=typeof body.message==='string'?body.message:settings.template
  let message:string
  try {message=renderSms(template,fields)} catch(error) {throw new SmsError(error instanceof Error?error.message:'Invalid SMS template.')}
  const segments=smsSegments(message)
  if(segments.segments>settings.max_parts) throw new SmsError(`Message exceeds the ${settings.max_parts}-segment limit.`)
  const id=typeof body.requestId==='string'?body.requestId:randomUUID()
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new SmsError('Invalid request identifier.')
  const expiry=typeof body.expires==='number'?body.expires:Date.now()+5*60_000
  if(expiry<Date.now()||expiry>Date.now()+6*60_000) throw new SmsError('Preview expired. Preview again.',409)
  const preview={id,ref,version,mobile,message,zone,test,actor:actor.id,expires:expiry}
  return {...preview,...segments,estimatedCents:segments.segments*settings.credit_price_cents,dueAt:nextSmsSendTime(new Date(),zone).toISOString(),fingerprint:signPreview(JSON.stringify(preview))}
}
export async function queueManualSms(actor:ClientCrmActor,body:Record<string,unknown>) {
  if(!smsLiveEnabled()) throw new SmsError('SMS sending is disabled in this environment.',409)
  if(body.confirmed!==true) throw new SmsError('Preview and confirm the recipient before sending.')
  const p=await prepareSms(actor,body)
  if(!secureTokenMatch(String(body.fingerprint||''),p.fingerprint)) throw new SmsError('Recipient or message changed. Preview again.',409)
  const settings=await smsSettings()
  if(settings.health.ready!==true || Date.now()-Date.parse(String(settings.health.checkedAt))>15*60_000) throw new SmsError('Check the SMS connection before sending.',409)
  if(p.test && !(process.env.SMS_TEST_RECIPIENTS||'').split(',').map(normalizeSmsMobile).includes(p.mobile)) throw new SmsError('This test number is not in the server test-recipient allowlist.',403)
  const db=getAdminSupabase()
  const {data,error}=await db.rpc('sms_enqueue_manual',{p_id:p.id,p_quote_ref:p.ref,p_version:p.version,p_mobile:p.mobile,p_message:p.message,p_zone:p.zone,p_test:p.test,p_actor:actor.id})
  if(error) throw error
  if(!data) throw new SmsError('Another SMS is already in progress, or the request changed.',409)
  return {id:p.id,status:'queued',dueAt:p.dueAt}
}
export async function smsInbox(actor:ClientCrmActor) {
  const db=getAdminSupabase()
  const result=await db.from('sms_replies').select('id,job_id,mobile,message,received_at,opted_out,read_at').is('read_at',null).order('received_at',{ascending:false}).limit(100)
  if(result.error) throw result.error
  const visible=[]
  for(const reply of result.data||[]) {
    const job=reply.job_id?await db.from('sms_jobs').select('quote_ref').eq('id',reply.job_id).maybeSingle():{data:null,error:null}
    if(job.error) throw job.error
    const ref=job.data?.quote_ref
    if(!ref&&actor.role!=='owner') continue
    if(actor.role==='agent') {
      if(!ref) continue
      try {await smsQuote(actor,ref)} catch(error) {if(error instanceof SmsError&&error.status===404) continue;throw error}
    }
    visible.push({...reply,quoteRef:ref||null,href:ref?(actor.role==='agent'?`/availability/quotes/${encodeURIComponent(actor.availabilityAssigneeId!)}/${encodeURIComponent(ref)}`:`/admin/quotes/${encodeURIComponent(ref)}`):null})
  }
  return visible
}
export async function markSmsReplyRead(actor:ClientCrmActor,id:string) {
  const replies=await smsInbox(actor)
  if(!replies.some(r=>r.id===id)) throw new SmsError('Reply not found.',404)
  const result=await getAdminSupabase().from('sms_replies').update({read_at:new Date().toISOString(),read_by:actor.id}).eq('id',id).is('read_at',null)
  if(result.error) throw result.error
}
export async function cancelQuoteSms(actor:ClientCrmActor,ref:string,id:string) {
  await smsQuote(actor,ref)
  const db=getAdminSupabase(),result=await db.from('sms_jobs').update({cancel_requested:true,reason:'staff_cancelled',status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id).eq('quote_ref',ref).is('first_attempt_at',null).in('status',['queued','leased']).select('id').maybeSingle()
  if(result.error) throw result.error
  if(!result.data) throw new SmsError('This SMS has already started sending and cannot be cancelled.',409)
}
