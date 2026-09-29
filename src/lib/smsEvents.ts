import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from './supabase'
import { isSmsOptOut, normalizeSmsMobile } from './smsPolicy'
import { smsAlert } from './smsAlerts'
export class SmsEventError extends Error {}
export function smsEventTime(value:unknown) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?Z?$/.test(value)) throw new SmsEventError('Invalid event timestamp')
  const date=new Date(value.replace(' ','T').replace(/Z?$/,'Z'))
  if(!Number.isFinite(date.getTime())) throw new SmsEventError('Invalid event timestamp')
  return date.toISOString()
}
export async function processSmsEvent(body:Record<string,unknown>) {
  const inbound=body.type==='inbound'||body.type==='unsubscribe'
  const mobile=normalizeSmsMobile(inbound?body.sender:body.to)
  const sender=normalizeSmsMobile(inbound?body.to:body.sender)
  if(!mobile||sender!==normalizeSmsMobile(process.env.MOBILE_MESSAGE_SENDER)) throw new SmsEventError('Invalid event numbers')
  const received=smsEventTime(body.received_at), message=String(body.message||'')
  if(message.length>5000) throw new SmsEventError('Event too large')
  const ref=String(inbound?body.original_custom_ref||'':body.custom_ref||'')
  const providerId=String(inbound?body.original_message_id||'':body.message_id||'')
  const db=getAdminSupabase()
  let job: {id:string;mobile:string;provider_id:string|null;quote_ref:string|null;first_attempt_at:string|null}|null=null
  if(/^sms:[0-9a-f-]{36}$/i.test(ref)) {
    const result=await db.from('sms_jobs').select('id,mobile,provider_id,quote_ref,first_attempt_at').eq('id',ref.slice(4)).maybeSingle()
    if(result.error) throw result.error;job=result.data
  } else if(providerId) {
    const result=await db.from('sms_jobs').select('id,mobile,provider_id,quote_ref,first_attempt_at').eq('provider_id',providerId).maybeSingle()
    if(result.error) throw result.error;job=result.data
  }
  if(job && (job.mobile!==mobile||!job.first_attempt_at||(job.provider_id&&providerId&&job.provider_id!==providerId))) throw new SmsEventError('Event does not match message')
  // Polling lacks correlation metadata. Associate only when a single quote owns the conversation.
  if(inbound&&!job) {
    const candidates=await db.from('sms_jobs').select('id,mobile,provider_id,quote_ref,first_attempt_at').eq('mobile',mobile).not('submitted_at','is',null).gte('submitted_at',new Date(Date.parse(received)-30*86400_000).toISOString()).lte('submitted_at',received).order('submitted_at',{ascending:false}).limit(20)
    if(candidates.error) throw candidates.error
    if(candidates.data?.length && new Set(candidates.data.map(j=>j.quote_ref)).size===1) job=candidates.data[0]
  }
  const optout=inbound&&(body.type==='unsubscribe'||isSmsOptOut(message))
  const part=Number(body.part_number),total=Number(body.total_parts)
  if(!inbound && (!['delivered','failed'].includes(String(body.status))||!providerId||!Number.isInteger(part)||!Number.isInteger(total)||part<1||total<part||total>99)) throw new SmsEventError('Invalid delivery receipt')
  const canonical=inbound?[mobile,sender,received,message]:[providerId,part,body.status]
  const key=`${inbound?'inbound':'status'}:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`
  const payload=inbound?{sender:mobile,to:sender,received_at:received,message}: {message_id:providerId,status:body.status,part_number:part,total_parts:total}
  const result=await db.rpc('sms_apply_event',{p_key:key,p_job:job?.id||null,p_kind:inbound?'inbound':'status',p_payload:payload,p_mobile:mobile,p_message:message,p_optout:optout,p_received:received})
  if(result.error) throw result.error
  // Outbox inserts are idempotent even if a previous webhook committed before an alert failed.
  if(inbound) await smsAlert(optout?'client_sms_opt_out':'client_sms_reply',job?.id,key)
  else if(body.status==='failed') await smsAlert('delivery_failed',job?.id,key)
  else if(!job) await smsAlert('unmatched_delivery_receipt',undefined,key)
  return result.data
}
