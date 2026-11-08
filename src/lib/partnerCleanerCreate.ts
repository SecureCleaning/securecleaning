import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from './supabase'
import type { PartnerActor } from './partnerBookingAuth'
import { PartnerError } from './partnerBookingPolicy'
import { partnerCleanerDetails, partnerCleanerReceipt } from './partnerCleanerPolicy'
import { defaultCleanerServiceAreas } from './cleanerServiceAreas'
import { createCleanerPortalLink } from './cleanerPortal'
import { EmailProviderRejectedError, sendEmailOrThrow } from './email'
import { reportEmailFailure } from './emailFailureAlerts'
import { PARTNER_CLEANER_SUBJECT, PARTNER_CLEANER_HISTORY, partnerCleanerMessage } from './partnerCleanerMessage'

export async function createPartnerCleaner(actor: PartnerActor, input: unknown) {
  const details = partnerCleanerDetails(input, actor.company)
  const db = getAdminSupabase()
  const fingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex')
  const reserved = await db.rpc('create_partner_cleaner_intake', {
    p_user_id: actor.id, p_session_version: actor.session_version,
    p_request_id: details.idempotencyKey, p_input_hash: fingerprint,
    p_inputs: details, p_service_areas: defaultCleanerServiceAreas(details.suburb),
  })
  if (reserved.error) {
    if (reserved.error.code === '42501') throw new PartnerError('Your access has changed. Please sign in again.', 403)
    if (reserved.error.code === '23514') throw new PartnerError('This submission has changed. Start a new cleaner entry or contact Secure Cleaning.', 409)
    if (reserved.error.code === '54000') throw new PartnerError('The hourly cleaner-entry limit has been reached. Please try later.', 429)
    throw reserved.error
  }
  const saved = reserved.data as { created: boolean; emailStatus: string }
  if (saved.emailStatus !== 'queued') return partnerCleanerReceipt(details.idempotencyKey, saved.emailStatus, !saved.created)

  // Durable claim rechecks account, state, recipient and suppressions. Only one
  // request may dispatch, even after a timeout, double click or fresh submission.
  const claim = await db.rpc('claim_partner_cleaner_email', {
    p_request_id: details.idempotencyKey, p_user_id: actor.id, p_session_version: actor.session_version,
    p_subject: PARTNER_CLEANER_SUBJECT, p_history: PARTNER_CLEANER_HISTORY,
  })
  if (claim.error || !claim.data) return partnerCleanerReceipt(details.idempotencyKey, 'review_required', !saved.created)
  let outcome: 'sent' | 'failed' | 'unknown' = 'unknown', providerId: string | null = null
  let providerAttempted = false
  try {
    const link = createCleanerPortalLink({ mode: 'update', email: claim.data.email, cleanerId: claim.data.cleanerId })
    const message = partnerCleanerMessage(claim.data.firstName, claim.data.businessName, link)
    providerAttempted = true
    const result = await sendEmailOrThrow({
      from: process.env.FROM_EMAIL || 'Secure Cleaning <quotes@securecleaning.com.au>',
      to: claim.data.email, replyTo: process.env.ADMIN_EMAIL || 'info@securecleaning.com.au', ...message,
    }, { idempotencyKey: `partner-cleaner/${details.idempotencyKey}` })
    outcome = 'sent'; providerId = result.id
  } catch (error) {
    outcome = error instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
    if (!providerAttempted) {
      outcome = 'failed'
      await reportEmailFailure({ payload: { to: claim.data.email, subject: PARTNER_CLEANER_SUBJECT }, outcome: 'not_sent', code: 'cleaner_profile_link_unavailable', idempotencyKey: `partner-cleaner/${details.idempotencyKey}` }).catch(() => {})
    }
  }
  const completed = await db.rpc('complete_partner_cleaner_email', {
    p_request_id: details.idempotencyKey, p_outcome: outcome, p_provider_id: providerId,
  })
  if (completed.error) await reportEmailFailure({ payload: { to: claim.data.email, subject: PARTNER_CLEANER_SUBJECT }, outcome: 'uncertain', code: 'cleaner_invitation_status_not_saved', idempotencyKey: `partner-cleaner/${details.idempotencyKey}` }).catch(() => {})
  return partnerCleanerReceipt(details.idempotencyKey, completed.error ? 'review_required' : outcome, !saved.created)
}
