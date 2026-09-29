import 'server-only'
import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from './supabase'
import { checkSmsConnection, mobileMessageRequest, providerScope, smsCredentialsConfigured, smsLiveEnabled, SmsProviderError } from './mobileMessage'
import { renderSms, smsSegments, type SmsJob } from './smsPolicy'
import { smsSettings } from './smsData'
import { deliverSmsAlerts, smsAlert } from './smsAlerts'
import { processSmsEvent } from './smsEvents'
async function updateJob(job:SmsJob,values:Record<string,unknown>) {
  const result=await getAdminSupabase().from('sms_jobs').update({...values,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token).in('status',['leased','submitting'])
  if(result.error) throw result.error
}
async function accepted(job:SmsJob,id:string,credits:number) {
  const result=await getAdminSupabase().rpc('sms_record_acceptance',{p_id:job.id,p_provider:id,p_credits:credits})
  if(result.error) throw result.error
}
export function smsResult(response:Record<string,unknown>):{id:string;credits:number}|null {
  const results=response.results as Array<Record<string,unknown>>|undefined
  if(response.status!=='complete'||!Array.isArray(results)||results.length!==1) throw new SmsProviderError('provider_response_unknown',true)
  const item=results[0]
  if(item.status==='blocked'||item.status==='error') return null
  if(item.status!=='success'||typeof item.message_id!=='string'||!item.message_id) throw new SmsProviderError('provider_response_unknown',true)
  const credits=Number(item.cost)
  if(!Number.isFinite(credits)||credits<0) throw new SmsProviderError('provider_response_unknown',true)
  return {id:item.message_id,credits}
}
export async function reconcileSmsJob(job:SmsJob):Promise<boolean> {
  const response=await mobileMessageRequest(`messages?custom_ref=${encodeURIComponent(`sms:${job.id}`)}&limit=10`)
  if(response.status!=='complete'||!Array.isArray(response.results)) throw new SmsProviderError('provider_history_unavailable')
  const matches=(response.results as Array<Record<string,unknown>>).filter(r=>r.custom_ref===`sms:${job.id}`)
  if(matches.length>1) throw new SmsProviderError('duplicate_provider_records')
  if(!matches.length) return false
  const match=matches[0]
  if(String(match.recipient_number).replace(/^\+/,'')!==job.mobile||typeof match.message_id!=='string') throw new SmsProviderError('provider_history_mismatch')
  await accepted(job,match.message_id,Number(match.cost)||0)
  if(['failed','delivered'].includes(String(match.status))) {
    const result=await getAdminSupabase().from('sms_jobs').update({status:match.status,reason:match.status==='failed'?'delivery_failed':null,reconcile_at:new Date().toISOString()}).eq('id',job.id).neq('status','failed')
    if(result.error) throw result.error
    if(match.status==='failed') await smsAlert('delivery_failed',job.id)
  }
  return true
}
async function work() {
  const db=getAdminSupabase(), settings=await smsSettings(), start=Date.now()
  const heartbeat=await db.from('sms_settings').update({worker_at:new Date().toISOString()}).eq('id',true);if(heartbeat.error) throw heartbeat.error
  // Read-only setup is allowed while disabled; no queued sends are released.
  if(!smsLiveEnabled()) {await deliverSmsAlerts();return {enabled:false}}
  try {
    if(!smsCredentialsConfigured()) throw new SmsProviderError('sms_not_configured')
    const health=await checkSmsConnection()
    const saved=await db.from('sms_settings').update({health}).eq('id',true);if(saved.error) throw saved.error
    if(health.balance<=settings.low_credit_threshold) await smsAlert('low_sms_credit')
    if(!health.ready) throw new SmsProviderError('sms_sender_or_webhook_not_ready')
    // Fetch recent inbound history as recovery for a lost webhook, without sending anything.
    const from=new Date(Date.parse(settings.inbound_checked_at)-86400_000).toISOString().slice(0,10)
    const inbound=await mobileMessageRequest(`inbound?from=${from}&limit=200`)
    if(inbound.status!=='complete'||!Array.isArray(inbound.results)) throw new SmsProviderError('inbound_history_unavailable')
    if(Number(inbound.total)>200) { await smsAlert('inbound_backlog_requires_review'); throw new SmsProviderError('inbound_backlog_requires_review') }
    for(const event of inbound.results as Array<Record<string,unknown>>) {
      await processSmsEvent({...event,sender:event.from})
      if(Date.now()-start>25_000) return {enabled:true,busy:true}
    }
    const polled=await db.from('sms_settings').update({inbound_checked_at:new Date(start).toISOString()}).eq('id',true);if(polled.error) throw polled.error
    const preferences=await db.from('sms_preferences').select('mobile').eq('provider_sync_pending',true).limit(2)
    if(preferences.error) throw preferences.error
    for(const pref of preferences.data||[]) {
      const synced=await mobileMessageRequest('unsubscribes','POST',{number:pref.mobile})
      if(synced.status!=='complete') throw new SmsProviderError('optout_sync_failed')
      const saved=await db.from('sms_preferences').update({provider_sync_pending:false}).eq('mobile',pref.mobile);if(saved.error) throw saved.error
    }
    let availableCredits=health.balance
    const claimed=await db.rpc('sms_claim',{p_token:randomUUID()});if(claimed.error) throw claimed.error
    for(const initial of (claimed.data||[]) as SmsJob[]) {
      let job=initial
      try {
        if(Date.now()-start>25_000) break
        if(job.first_attempt_at && await reconcileSmsJob(job)) continue
        // A cancellation or credential change during an uncertain request must never replay it.
        if(job.first_attempt_at && (job.cancel_requested||job.provider_scope!==providerScope()||Date.now()-Date.parse(job.first_attempt_at)>23*3600_000||job.attempt_count>=3)) {
          await updateJob(job,{status:'review',reason:'unknown_requires_reconciliation',lease_token:null,lease_until:null});await smsAlert('unknown_requires_reconciliation',job.id);continue
        }
        const message=job.message||renderSms(job.template,job.fields)
        if(smsSegments(message).segments>settings.max_parts) {
          await updateJob(job,{status:'skipped',reason:'segment_limit',lease_token:null,lease_until:null});await smsAlert('segment_limit',job.id);continue
        }
        if(job.purpose==='test' && !(process.env.SMS_TEST_RECIPIENTS||'').split(',').map(v=>v.trim().replace(/^\+/, '')).includes(job.mobile)) {
          await updateJob(job,{status:'cancelled',reason:'test_recipient_not_allowed',lease_token:null,lease_until:null});continue
        }
        if(!job.first_attempt_at && Date.parse(job.expires_at)<Date.now()) {
          await updateJob(job,{status:'skipped',reason:'reminder_stale',lease_token:null,lease_until:null});await smsAlert('reminder_stale',job.id);continue
        }
        if(!job.first_attempt_at && availableCredits<smsSegments(message).segments) {
          await updateJob(job,{status:'queued',reason:'insufficient_credit',due_at:new Date(Date.now()+5*60_000).toISOString(),lease_token:null,lease_until:null});await smsAlert('low_sms_credit');continue
        }
        const payload=job.request_payload||{enable_unicode:true,ignore_unsubscribes:false,shorten_urls:false,max_parts:settings.max_parts,messages:[{to:job.mobile,message,sender:health.sender,custom_ref:`sms:${job.id}`}]}
        const claim=await db.rpc('sms_dispatch',{p_id:job.id,p_token:job.lease_token,p_message:message,p_payload:payload,p_scope:providerScope()});if(claim.error) throw claim.error
        if(!claim.data?.length) {
          const outcome=await db.from('sms_jobs').select('status,reason').eq('id',job.id).single();if(outcome.error) throw outcome.error
          if(outcome.data?.status==='review'||['reminder_stale','invalid_mobile','unknown_timezone'].includes(outcome.data?.reason)) await smsAlert(outcome.data.reason||'sms_needs_review',job.id)
          continue
        }
        job=claim.data[0]
        const response=await mobileMessageRequest('messages','POST',payload,job.id)
        const result=smsResult(response)
        const blocked=(response.results as Array<Record<string,unknown>>)?.[0]?.status==='blocked'
        if(blocked) {
          const pref=await db.rpc('sms_save_preference',{p_mobile:job.mobile,p_consent:false,p_evidence:'Provider unsubscribe list',p_actor:'provider',p_quote_ref:job.quote_ref||job.id});if(pref.error) throw pref.error
        }
        if(!result) {await updateJob(job,{status:'failed',reason:'provider_rejected',lease_token:null,lease_until:null});await smsAlert('provider_rejected',job.id)}
        else {await accepted(job,result.id,result.credits);availableCredits-=result.credits}
      } catch(error) {
        const code=error instanceof SmsProviderError?error.code:'sms_internal_error'
        // Once dispatch was persisted, database/network errors are also uncertain.
        const definite=error instanceof SmsProviderError && /^provider_http_4(?!29)/.test(error.code)
        const uncertain=Boolean(job.first_attempt_at) && !definite
        await updateJob(job,{status:definite?'failed':uncertain?'unknown':'queued',reason:code,due_at:new Date(Date.now()+5*60_000).toISOString(),lease_token:null,lease_until:null})
        await smsAlert(code,job.id)
      }
    }
    if(Date.now()-start<25_000) {
      const pending=await db.from('sms_jobs').select('*').eq('status','submitted').or(`reconcile_at.is.null,reconcile_at.lt.${new Date(Date.now()-3600_000).toISOString()}`).order('submitted_at').limit(1)
      if(pending.error) throw pending.error
      for(const job of pending.data||[]) {
        await reconcileSmsJob(job)
        const saved=await db.from('sms_jobs').update({reconcile_at:new Date().toISOString()}).eq('id',job.id);if(saved.error) throw saved.error
        if(Date.now()-Date.parse(job.submitted_at)>24*3600_000) await smsAlert('delivery_confirmation_overdue',job.id)
      }
    }
  } catch(error) {
    const code=error instanceof SmsProviderError?error.code:'sms_worker_error'
    await smsAlert(code)
    const saved=await db.from('sms_settings').update({health:{ready:false,error:code,checkedAt:new Date().toISOString()}}).eq('id',true);if(saved.error) throw saved.error
  }
  await deliverSmsAlerts()
  return {enabled:true}
}

export async function runSmsWorker() {
 const db=getAdminSupabase(),token=randomUUID()
 const lock=await db.rpc('sms_worker_lock',{p_token:token});if(lock.error) throw lock.error
 if(!lock.data) return {busy:true}
 try {return await work()} finally {
  const release=await db.from('sms_settings').update({worker_lease_until:null,worker_token:null}).eq('id',true).eq('worker_token',token)
  if(release.error) throw release.error
 }
}
