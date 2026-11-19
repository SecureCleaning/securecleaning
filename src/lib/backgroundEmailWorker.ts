import 'server-only'
import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getContractProductStateForCity } from '@/lib/contractProductPolicy'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { continueContractProductBroadcast } from '@/lib/contractProductBroadcasts'
import { continueCleanerEmail } from '@/lib/cleanerEmailDelivery'

// The scheduler only claims explicitly enrolled jobs. It never scans old campaigns
// looking for unsent recipients, and a browser is never needed to keep it running.
export async function runBackgroundEmailWorker() {
  const db = getAdminSupabase()
  const token = randomUUID()
  const { data, error } = await db.rpc('claim_background_email_job', { p_token: token })
  if (error) throw new Error('Background queue unavailable')
  const job = data?.[0]
  if (!job) return { processed: 0 }
  let status = 'queued'
  let code: string | null = null
  try {
    const account = await getStaffAccountProfileById(job.actor_id)
    if (!account?.active || !['owner', 'manager', 'staff', 'agent'].includes(account.role)) {
      status = 'review'; code = 'actor_unavailable'
    } else {
      let result: { inProgress?: boolean; paused?: boolean }
      if (job.kind === 'broadcast') {
        if (account.role === 'staff') throw new Error('Broadcast permission changed')
        const assignee = account.availabilityAssigneeId
          ? getAvailabilityAssignee(await getAvailabilityConfig(), account.availabilityAssigneeId) : null
        const productState = assignee?.active ? getContractProductStateForCity(assignee.city) : null
        if (account.role === 'agent' && !productState) throw new Error('Agent region unavailable')
        const { data: campaign, error: campaignError } = await db.from('cleaner_broadcast_campaigns')
          .select('idempotency_key').eq('id', job.target_id).eq('created_by_staff_id', account.id).maybeSingle()
        if (campaignError || !campaign) throw new Error('Broadcast unavailable')
        result = await continueContractProductBroadcast({ ...account, productState } as ContractProductActor,
          { idempotencyKey: campaign.idempotency_key }, true)
      } else {
        result = await continueCleanerEmail(account, job.target_id, true)
      }
      status = result.paused ? 'paused' : result.inProgress ? 'queued' : 'completed'
      if (result.paused) code = 'provider_quota'
    }
  } catch {
    // A process failure never resets a recipient. Only definitely-unsent queued
    // rows are eligible on the next pass; uncertain outcomes require review.
    status = job.failures >= 2 ? 'review' : 'queued'
    code = 'delivery_check_required'
  }
  const { data: finished, error: finishError } = await db.rpc('finish_background_email_job', {
    p_kind: job.kind, p_target_id: job.target_id, p_token: token, p_status: status, p_failure_code: code,
  })
  if (finishError || !finished) throw new Error('Background job outcome unavailable')
  return { processed: 1, status }
}
