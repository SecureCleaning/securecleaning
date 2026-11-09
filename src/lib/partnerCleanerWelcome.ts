import 'server-only'
import { getAdminSupabase } from './supabase'
import type { PartnerActor } from './partnerBookingAuth'
import { loadPartnerConfig } from './partnerBookingAvailability'
import { compareBookingPriority } from './availabilityPriority'
import { getStateForAvailabilityCity } from './cleanerAgentPolicy'
import { resolveCleanerEmailSender } from './cleanerEmailSenders'
import { listCleanerEmailTemplates } from './cleanerEmailTemplates'
import { parseCleanerEmailInput, renderCleanerEmail, type CleanerEmailRecipient } from './cleanerEmailPolicy'
import { EmailProviderRejectedError, sendEmailOrThrow } from './email'
import { reportEmailFailure } from './emailFailureAlerts'
import { getSiteUrl } from './siteUrl'

export const PARTNER_CLEANER_WELCOME_TEMPLATE = 'New Cleaner First Email'
class WelcomeSetupError extends Error {}

export async function resolvePartnerCleanerWelcome(state: string) {
  // A configuration outage must not select one of the demo/default calendars.
  const { config } = await loadPartnerConfig()
  const agent = config.assignees.filter(a => a.active && getStateForAvailabilityCity(a.city) === state).sort(compareBookingPriority)[0]
  if (!agent) throw new WelcomeSetupError('No active agent is configured for this cleaner state.')
  let sender
  try { sender = await resolveCleanerEmailSender({ id: agent.id, role: 'availability_agent' }, undefined, state) }
  catch { throw new WelcomeSetupError('The priority agent needs one active linked Team Access account with a complete email signature.') }
  const template = (await listCleanerEmailTemplates()).find(t => t.name.trim().toLowerCase() === PARTNER_CLEANER_WELCOME_TEMPLATE.toLowerCase())
  if (!template?.is_active) throw new WelcomeSetupError('Activate the saved New Cleaner First Email template in the Cleaner Database.')
  return { sender, template }
}

export async function sendPartnerCleanerWelcome(actor: PartnerActor, requestId: string, currentStatus: string) {
  if (currentStatus !== 'queued') return currentStatus
  const db = getAdminSupabase()
  // Separate claim from the profile link: a replay cannot send either email twice.
  const claim = await db.rpc('claim_partner_cleaner_welcome_email', {
    p_request_id: requestId, p_user_id: actor.id, p_session_version: actor.session_version,
    p_subject: PARTNER_CLEANER_WELCOME_TEMPLATE, p_history: 'Preparing the separately requested cleaner introduction email.',
  })
  if (claim.error || !claim.data) return 'review_required'
  const cleaner = claim.data.cleaner as CleanerEmailRecipient
  const idempotencyKey = `partner-cleaner-welcome/${requestId}`
  let outcome: 'sent' | 'failed' | 'unknown' = 'unknown', providerId: string | null = null
  let providerAttempted = false, reason: string | null = null
  try {
    const { sender, template } = await resolvePartnerCleanerWelcome(cleaner.state || '')
    const { data: preferences, error } = await db.from('cleaners').select('broadcast_unsubscribe_token').eq('id', cleaner.id).eq('email', cleaner.email).maybeSingle()
    if (error || !preferences?.broadcast_unsubscribe_token) throw new WelcomeSetupError('Cleaner email preferences could not be loaded. No introduction was sent.')
    const token = encodeURIComponent(preferences.broadcast_unsubscribe_token)
    const unsubscribeUrl = `${getSiteUrl()}/cleaner-email-preferences/unsubscribe?token=${token}`
    const oneClickUrl = `${getSiteUrl()}/api/cleaner-email-preferences/unsubscribe?token=${token}`
    const input = parseCleanerEmailInput({ emails: cleaner.email, subject: template.subject, body: template.body, bodyHtml: template.body_html, bodyDocument: template.body_document, templateId: template.id })
    const message = renderCleanerEmail(input, cleaner, sender, unsubscribeUrl, 'partner_lead')
    const headers = { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    // Save the exact wording and sender for staff history before contacting Resend.
    const history = await db.from('cleaner_emails').update({
      template_id: template.id, template_name: template.name, subject: message.subject, body: message.body,
      body_html_snapshot: input.bodyHtml, body_document_snapshot: input.bodyDocument,
      final_html_snapshot: message.html, final_text_snapshot: message.text,
      delivery_headers: { from: sender.from, replyTo: sender.replyTo, cc: sender.cc, ...headers }, sent_by: sender.displayName,
    }).eq('id', claim.data.emailId).eq('delivery_outcome', 'sending').select('id').single()
    if (history.error || !history.data) throw new WelcomeSetupError('Introduction email history could not be saved. No introduction was sent.')
    providerAttempted = true
    const result = await sendEmailOrThrow({ from: sender.from, to: cleaner.email, replyTo: sender.replyTo, cc: sender.cc, subject: message.subject, html: message.html, text: message.text, headers }, { idempotencyKey })
    outcome = 'sent'; providerId = result.id
  } catch (error) {
    outcome = error instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
    if (!providerAttempted) {
      outcome = 'failed'
      reason = error instanceof WelcomeSetupError ? error.message : 'The introduction email could not be prepared. Check the saved template and agent configuration.'
      await reportEmailFailure({ payload: { to: cleaner.email, subject: PARTNER_CLEANER_WELCOME_TEMPLATE }, outcome: 'not_sent', code: 'cleaner_welcome_preparation_failed', idempotencyKey }).catch(() => {})
    }
  }
  const completed = await db.rpc('complete_partner_cleaner_welcome_email', { p_request_id: requestId, p_outcome: outcome, p_provider_id: providerId, p_reason: reason })
  if (completed.error) await reportEmailFailure({ payload: { to: cleaner.email, subject: PARTNER_CLEANER_WELCOME_TEMPLATE }, outcome: 'uncertain', code: 'cleaner_welcome_status_not_saved', idempotencyKey }).catch(() => {})
  return completed.error ? 'review_required' : outcome
}
