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
import { getSiteUrl } from './siteUrl'
import { sendPartnerCleanerWelcome } from './partnerCleanerWelcome'

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
  const saved = reserved.data as { created: boolean; emailStatus: string; welcomeEmailStatus?: string }
  const emailStatus = await sendProfileInvitation(actor, details.idempotencyKey, saved.emailStatus)
  const welcomeEmailStatus = await sendPartnerCleanerWelcome(actor, details.idempotencyKey, saved.welcomeEmailStatus || 'not_required')
  return partnerCleanerReceipt(details.idempotencyKey, emailStatus, !saved.created, welcomeEmailStatus)
}

async function sendProfileInvitation(actor: PartnerActor, requestId: string, currentStatus: string) {
  if (currentStatus !== 'queued') return currentStatus
  const db = getAdminSupabase()

  // Durable claim rechecks account, state, recipient and suppressions. Only one
  // request may dispatch, even after a timeout, double click or fresh submission.
  const claim = await db.rpc('claim_partner_cleaner_email', {
    p_request_id: requestId, p_user_id: actor.id, p_session_version: actor.session_version,
    p_subject: PARTNER_CLEANER_SUBJECT, p_history: PARTNER_CLEANER_HISTORY,
  })
  if (claim.error || !claim.data) return 'review_required'
  let outcome: 'sent' | 'failed' | 'unknown' = 'unknown', providerId: string | null = null
  let providerAttempted = false
  try {
    const { data: cleaner, error: cleanerError } = await db.from('cleaners')
      .select('broadcast_unsubscribe_token').eq('id', claim.data.cleanerId).eq('email', claim.data.email).maybeSingle()
    if (cleanerError || !cleaner?.broadcast_unsubscribe_token) throw new Error('Cleaner email preferences unavailable')
    const token = encodeURIComponent(cleaner.broadcast_unsubscribe_token)
    const unsubscribeUrl = `${getSiteUrl()}/cleaner-email-preferences/unsubscribe?token=${token}`
    const oneClickUrl = `${getSiteUrl()}/api/cleaner-email-preferences/unsubscribe?token=${token}`
    const link = createCleanerPortalLink({ mode: 'update', email: claim.data.email, cleanerId: claim.data.cleanerId })
    const message = partnerCleanerMessage(claim.data.firstName, claim.data.businessName, link, unsubscribeUrl)
    providerAttempted = true
    const result = await sendEmailOrThrow({
      from: process.env.FROM_EMAIL || 'Secure Cleaning <quotes@securecleaning.com.au>',
      to: claim.data.email, replyTo: process.env.ADMIN_EMAIL || 'info@securecleaning.com.au', ...message,
      headers: { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }, { idempotencyKey: `partner-cleaner/${requestId}` })
    outcome = 'sent'; providerId = result.id
  } catch (error) {
    outcome = error instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
    if (!providerAttempted) {
      outcome = 'failed'
      await reportEmailFailure({ payload: { to: claim.data.email, subject: PARTNER_CLEANER_SUBJECT }, outcome: 'not_sent', code: 'cleaner_invitation_preparation_failed', idempotencyKey: `partner-cleaner/${requestId}` }).catch(() => {})
    }
  }
  const completed = await db.rpc('complete_partner_cleaner_email', {
    p_request_id: requestId, p_outcome: outcome, p_provider_id: providerId,
  })
  if (completed.error) await reportEmailFailure({ payload: { to: claim.data.email, subject: PARTNER_CLEANER_SUBJECT }, outcome: 'uncertain', code: 'cleaner_invitation_status_not_saved', idempotencyKey: `partner-cleaner/${requestId}` }).catch(() => {})
  return completed.error ? 'review_required' : outcome
}
