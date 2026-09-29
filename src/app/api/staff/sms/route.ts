import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { smsActor, requireSmsOwner, smsSettings, saveSmsSettings, quoteSmsHistory, setSmsPreference, prepareSms, queueManualSms, smsInbox, markSmsReplyRead, cancelQuoteSms, SmsError } from '@/lib/smsData'
import { checkSmsConnection, smsCredentialsConfigured, smsLiveEnabled, SmsProviderError } from '@/lib/mobileMessage'
import { getAdminSupabase } from '@/lib/supabase'
import { reconcileSmsJob } from '@/lib/smsWorker'
import { smsAlert } from '@/lib/smsAlerts'
export const dynamic='force-dynamic'
function reply(data:unknown,status=200) {return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}})}
async function failure(error:unknown) {
  if(error instanceof SmsError) return reply({error:error.message},error.status)
  const code=error instanceof SmsProviderError?error.code:'sms_staff_action_failed'
  try {await smsAlert(code)} catch { /* Setup may not yet be installed. */ }
  return reply({error:'SMS action could not be completed. Check setup and delivery history before retrying.'},503)
}
export async function GET(request:NextRequest) {
  try {
    const actor=await smsActor(request), view=request.nextUrl.searchParams.get('view')
    if(view==='quote') return reply(await quoteSmsHistory(actor,request.nextUrl.searchParams.get('quoteRef')||''))
    if(view==='inbox') return reply({replies:await smsInbox(actor),owner:actor.role==='owner'})
    requireSmsOwner(actor)
    const db=getAdminSupabase(), settings=await smsSettings()
    const [jobs,alerts]=await Promise.all([db.from('sms_jobs').select('id,quote_ref,purpose,mobile,status,reason,due_at,created_at,credits').order('created_at',{ascending:false}).limit(100),db.from('sms_alerts').select('id,code,status,created_at,sent_at').order('created_at',{ascending:false}).limit(50)])
    if(jobs.error||alerts.error) throw jobs.error||alerts.error
    return reply({settings,jobs:jobs.data,alerts:alerts.data,configured:smsCredentialsConfigured(),live:smsLiveEnabled()})
  } catch(error) {return failure(error)}
}
export async function POST(request:NextRequest) {
  const rejected=rejectCrossOriginMutation(request)||rejectLargePayload(request,16000)||rateLimit(request,{key:'staff-sms',limit:30,windowMs:60_000})
  if(rejected) return rejected
  try {
    const actor=await smsActor(request),raw=await request.text()
    if(Buffer.byteLength(raw)>16000) throw new SmsError('Request is too large.',413)
    let body:Record<string,unknown>
    try {body=JSON.parse(raw)} catch {throw new SmsError('Invalid request.')}
    if(!body||typeof body!=='object'||Array.isArray(body)) throw new SmsError('Invalid request.')
    const ref=String(body.quoteRef||'')
    switch(body.action) {
      case 'settings': await saveSmsSettings(actor,body);break
      case 'connection': {
        requireSmsOwner(actor);const health=await checkSmsConnection()
        const result=await getAdminSupabase().from('sms_settings').update({health}).eq('id',true);if(result.error) throw result.error
        if(!health.ready) await smsAlert('sms_sender_or_webhook_not_ready')
        return reply({health})
      }
      case 'reconcile': {
        requireSmsOwner(actor)
        const job=await getAdminSupabase().from('sms_jobs').select('*').eq('id',String(body.id||'')).maybeSingle()
        if(job.error) throw job.error
        if(!job.data?.first_attempt_at) throw new SmsError('No provider submission to reconcile.',409)
        return reply({found:await reconcileSmsJob(job.data)})
      }
      case 'preference': await setSmsPreference(actor,ref,body);break
      case 'preview': return reply(await prepareSms(actor,body))
      case 'send': return reply(await queueManualSms(actor,body))
      case 'read': await markSmsReplyRead(actor,String(body.id||''));break
      case 'cancel': await cancelQuoteSms(actor,ref,String(body.id||''));break
      default: throw new SmsError('Unknown action.')
    }
    return reply({ok:true})
  } catch(error) {return failure(error)}
}
