import 'server-only'
import { getAdminSupabase } from './supabase'
import { smsSettings } from './smsData'
/** Store safe codes only. Never persist API bodies or credentials in alerts. */
export async function smsAlert(code: string, jobId?: string, eventId?: string) {
  const safe = /^[a-z0-9_]{1,80}$/.test(code) ? code : 'sms_internal_error'
  const key = `${safe}:${eventId || jobId || new Date().toISOString().slice(0,10)}`
  const {error}=await getAdminSupabase().from('sms_alerts').upsert({dedupe_key:key,code:safe,job_id:jobId||null},{onConflict:'dedupe_key',ignoreDuplicates:true})
  if(error) throw error
}
export async function deliverSmsAlerts() {
  if(process.env.VERCEL_ENV!=='production'||!process.env.RESEND_API_KEY) return
  const db=getAdminSupabase(), settings=await smsSettings()
  const {data,error}=await db.from('sms_alerts').select('*').eq('status','pending').order('created_at').limit(3)
  if(error) throw error
  for(const alert of data||[]) {
    // Freeze the recipient with the payload; Resend idempotency retries must be identical.
    let recipient=alert.recipient as string|null
    if(!recipient) {
      const frozen=await db.from('sms_alerts').update({recipient:settings.alert_email}).eq('id',alert.id).is('recipient',null).select('recipient').maybeSingle()
      if(frozen.error) throw frozen.error
      recipient=frozen.data?.recipient || (await db.from('sms_alerts').select('recipient').eq('id',alert.id).single()).data?.recipient
    }
    if(!recipient) continue
    // Beyond Resend's 24-hour idempotency window require review, never risk repeated alerts.
    if(alert.first_attempt_at && Date.now()-Date.parse(alert.first_attempt_at)>23*3600_000) {
      const result=await db.from('sms_alerts').update({status:'review'}).eq('id',alert.id); if(result.error) throw result.error; continue
    }
    if(!alert.first_attempt_at) {
      const result=await db.from('sms_alerts').update({first_attempt_at:new Date().toISOString()}).eq('id',alert.id).is('first_attempt_at',null)
      if(result.error) throw result.error
    }
    const text=`Secure Cleaning SMS notification: ${alert.code.replace(/_/g,' ')}.\n${alert.job_id?`SMS reference: ${alert.job_id}.\n`:''}Open https://securecleaning.com.au/admin/sms to review delivery history, replies and connection status. No client details are included in this alert.`
    try {
      const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`sms-alert/${alert.id}`},body:JSON.stringify({from:'Secure Cleaning <quotes@securecleaning.com.au>',to:[recipient],subject:'Secure Cleaning SMS notification',text})})
      const result=await response.json()
      if(response.ok && result.id) {
        const saved=await db.from('sms_alerts').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',alert.id)
        if(saved.error) throw saved.error
      }
    } catch { /* Leave pending. The same alert and key are retried by the next worker. */ }
  }
}
