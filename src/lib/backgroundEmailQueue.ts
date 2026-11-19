import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'

export type BackgroundEmailKind = 'broadcast' | 'cleaner_batch'
export type BackgroundEmailStatus = 'queued' | 'running' | 'paused' | 'review' | 'completed'

export function requireBackgroundEmailWorker() {
  if ((process.env.BULK_EMAIL_WORKER_SECRET ?? '').length < 32) {
    throw new Error('Background email sending is not configured. No new delivery has been started.')
  }
}

export async function enqueueBackgroundEmail(kind: BackgroundEmailKind, targetId: string, actorId: string, resume = false) {
  requireBackgroundEmailWorker()
  const { error } = await getAdminSupabase().rpc('enqueue_background_email', {
    p_kind: kind, p_target_id: targetId, p_actor_id: actorId, p_resume: resume,
  })
  if (error) throw new Error('Unable to queue background delivery. Keep this request and check its status before starting another email.')
}

export async function backgroundEmailStatus(kind: BackgroundEmailKind, targetId: string) {
  const { data, error } = await getAdminSupabase().from('background_email_jobs')
    .select('status,failure_code,updated_at,next_attempt_at').eq('kind', kind).eq('target_id', targetId).maybeSingle()
  if (error) throw new Error('Unable to check background delivery.')
  const delayed = data && ['queued', 'running'].includes(data.status) && Date.now() - Date.parse(data.updated_at) > 5 * 60_000
  return {
    backgroundStatus: (data?.status ?? null) as BackgroundEmailStatus | null,
    paused: !data || data.status === 'paused' || data.status === 'review',
    deliveryMessage: !data ? 'This saved request has not been queued for background sending. Review it before resuming unsent recipients.'
      : data.status === 'paused' ? 'The email provider quota was reached. Resume unsent recipients after the quota resets or your plan is upgraded.'
      : data.status === 'review' ? 'Delivery needs a team review. Sent and uncertain messages will not be retried.'
      : data.status === 'completed' ? 'Background delivery finished. Check any unresolved recipients in email history.'
      : delayed ? 'Background delivery is delayed. Queued recipients are saved; ask an administrator to check the delivery worker before starting another email.'
      : 'Emails are sending in the background. You can close this page.',
  }
}
