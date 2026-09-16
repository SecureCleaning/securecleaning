import { readEmailPages, acquireEmailDeliverySlot, emailProviderPause, EMAIL_DELIVERY_STEP_SIZE, EMAIL_DELIVERY_STEP_MS } from '@/lib/emailDeliveryQueue'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import type { AdminSessionIdentity } from '@/lib/adminAuth'
import { getMissingCrmSignatureFields } from '@/lib/clientCrmPolicy'
import { sendEmailOrThrow, EmailProviderRejectedError } from '@/lib/email'
import { getSiteUrl } from '@/lib/siteUrl'
import { CleanerEmailError, CLEANER_EMAIL_UUID, parseCleanerEmailInput, renderCleanerEmail, type CleanerEmailRecipient } from '@/lib/cleanerEmailPolicy'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function senderFor(actor: AdminSessionIdentity) {
  const sender = await getStaffAccountProfileById(actor.id)
  if (!sender?.active || !['staff', 'manager', 'owner'].includes(sender.role)) throw new CleanerEmailError('An active staff account is required to send cleaner updates.')
  if (getMissingCrmSignatureFields(sender).length) throw new CleanerEmailError('Complete your name, role, phone and email signature in Team Access before sending.')
  return { displayName: sender.displayName, jobTitle: sender.jobTitle, phone: sender.phone, email: sender.email }
}
async function prepare(actor: AdminSessionIdentity, value: unknown) {
  const input = parseCleanerEmailInput(value)
  const sender = await senderFor(actor)
  const db = getAdminSupabase()
  const rows: Array<CleanerEmailRecipient & { status: string; broadcast_unsubscribe_token: string }> = []
  const blockedEmails = new Set<string>()
  const blockedIds = new Set<string>()
  for (let offset = 0; offset < input.emails.length; offset += 100) {
    const addresses = input.emails.slice(offset, offset + 100)
    const { data, error } = await db.from('cleaners').select('id,email,contact_name,first_name,last_name,business_name,city,suburb,state,status,broadcast_unsubscribe_token').in('email', addresses)
    if (error) throw new Error('Cleaner lookup failed')
    rows.push(...(data ?? []))
    const [global, local] = await Promise.all([
      db.from('crm_email_suppressions').select('email_normalized').in('email_normalized', addresses).eq('blocks_all', true),
      data?.length ? db.from('cleaner_broadcast_suppressions').select('cleaner_id').in('cleaner_id', data.map(row => row.id)) : Promise.resolve({ data: [], error: null }),
    ])
    if (global.error || local.error) throw new Error('Email preferences could not be checked')
    for (const row of global.data ?? []) blockedEmails.add(row.email_normalized)
    for (const row of local.data ?? []) blockedIds.add(row.cleaner_id)
  }
  const messages = input.emails.map(email => {
    const cleaner = rows.find(row => String(row.email).trim().toLowerCase() === email)
    if (!cleaner || cleaner.status !== 'approved' || blockedEmails.has(email) || blockedIds.has(cleaner.id) || !cleaner.broadcast_unsubscribe_token) {
      throw new CleanerEmailError(`${email} is not an eligible approved cleaner or has unsubscribed. Remove this address before previewing.`)
    }
    const unsubscribeUrl = `${getSiteUrl()}/cleaner-email-preferences/unsubscribe?token=${encodeURIComponent(cleaner.broadcast_unsubscribe_token)}`
    return { cleanerId: cleaner.id as string, email, name: cleaner.contact_name as string, unsubscribeUrl, ...renderCleanerEmail(input, cleaner as CleanerEmailRecipient, sender, unsubscribeUrl) }
  })
  let templateName: string | null = null
  if (input.templateId) {
    const { data: template, error: templateError } = await db.from('cleaner_email_templates').select('name').eq('id', input.templateId).eq('is_active', true).maybeSingle()
    if (templateError || !template) throw new CleanerEmailError('This template is unavailable. Select another template or write a custom message.')
    templateName = template.name
  }
  return { input, sender, messages, templateName, fingerprint: hash({ input, sender, messages }) }
}
export async function previewCleanerEmail(actor: AdminSessionIdentity, value: unknown) {
  const prepared = await prepare(actor, value)
  const selectedId = typeof value === 'object' && value !== null && 'previewCleanerId' in value ? String(value.previewCleanerId) : prepared.messages[0]?.cleanerId
  return { fingerprint: prepared.fingerprint, sender: prepared.sender, recipients: prepared.messages.map(message => ({ id: message.cleanerId, email: message.email, name: message.name, subject: message.subject, html: message.cleanerId === selectedId ? message.html : '' })) }
}
async function results(actor: AdminSessionIdentity, requestId: string, duplicate: boolean) {
  const db = getAdminSupabase()
  const { data: batch, error: batchError } = await db.from('cleaner_email_batches').select('id').eq('id', requestId).eq('actor_id', actor.id).maybeSingle()
  if (batchError || !batch) throw new CleanerEmailError('Email request not found. Keep this draft and check again before sending another copy.')
  const data = await readEmailPages((from, to) => db.from('cleaner_emails').select('id,to_email,subject,delivery_outcome').eq('batch_id', requestId).order('id').range(from, to))
  return { recipients: data, duplicate, inProgress: data.some(row => row.delivery_outcome === 'queued') }
}
export async function cleanerEmailResults(actor: AdminSessionIdentity, requestId: unknown) {
  if (typeof requestId !== 'string' || !CLEANER_EMAIL_UUID.test(requestId)) throw new CleanerEmailError('Invalid email request.')
  await senderFor(actor)
  return results(actor, requestId, true)
}
export async function deliverCleanerEmail(actor: AdminSessionIdentity, value: Record<string, unknown>) {
  const input = parseCleanerEmailInput(value)
  const requestId = value.requestId
  if (typeof requestId !== 'string' || !CLEANER_EMAIL_UUID.test(requestId)) throw new CleanerEmailError('A valid email request ID is required.')
  await senderFor(actor)
  const db = getAdminSupabase()
  const inputHash = hash(input)
  const { data: existing, error: existingError } = await db.from('cleaner_email_batches').select('actor_id,input_hash').eq('id', requestId).maybeSingle()
  if (existingError) throw new Error('Email delivery migration is unavailable')
  if (existing) {
    if (existing.actor_id !== actor.id || existing.input_hash !== inputHash) throw new CleanerEmailError('This email request belongs to a different draft. Start a new message.')
    return results(actor, requestId, true)
  }
  const prepared = await prepare(actor, value)
  if (value.fingerprint !== prepared.fingerprint) throw new CleanerEmailError('The recipients, sender or message changed. Preview again before sending.')
  if (!process.env.RESEND_API_KEY) throw new CleanerEmailError('Email sending is not configured.')
  const { data: reserved, error: reserveError } = await db.rpc('reserve_cleaner_email_batch_v2', {
    p_id: requestId, p_actor_id: actor.id, p_input_hash: inputHash,
    p_messages: prepared.messages.map(message => ({ cleaner_id: message.cleanerId, email: message.email, subject: message.subject, body: message.body, body_html: prepared.input.bodyHtml, body_document: prepared.input.bodyDocument, html: message.html, text: message.text, headers: { 'List-Unsubscribe': `<${message.unsubscribeUrl.replace('/cleaner-email-preferences/', '/api/cleaner-email-preferences/')}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })),
    p_template_id: input.templateId, p_template_name: prepared.templateName,
    p_delivery: { from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', replyTo: prepared.sender.email },
  })
  if (reserveError) throw new CleanerEmailError('Unable to reserve this send. Recipients may have changed, or the hourly send limit was reached. Preview again or try later.')
  if (!reserved) return results(actor, requestId, true)
  return continueCleanerEmail(actor, requestId)
}

export async function continueCleanerEmail(actor: AdminSessionIdentity, requestId: unknown) {
  if (typeof requestId !== 'string' || !CLEANER_EMAIL_UUID.test(requestId)) throw new CleanerEmailError('Invalid email request.')
  await senderFor(actor)
  const db = getAdminSupabase()
  const { data: batch, error: batchError } = await db.from('cleaner_email_batches').select('delivery').eq('id', requestId).eq('actor_id', actor.id).maybeSingle()
  if (batchError || !batch) throw new CleanerEmailError('Email request not found.')
  if (!batch.delivery?.from || !batch.delivery?.replyTo) throw new CleanerEmailError('This older email request cannot be resumed. Check its delivery history before starting another send.')
  const { data: entries, error: entryError } = await db.from('cleaner_emails')
    .select('id,to_email,subject,final_html_snapshot,final_text_snapshot,delivery_headers')
    .eq('batch_id', requestId).eq('delivery_outcome', 'queued').order('id').limit(EMAIL_DELIVERY_STEP_SIZE)
  if (entryError) throw new Error('Unable to read reserved email records')
  const deadline = Date.now() + EMAIL_DELIVERY_STEP_MS
  let paused = false
  for (const entry of entries ?? []) {
    if (Date.now() >= deadline || !(await acquireEmailDeliverySlot())) break
    const { data: claimed, error: claimError } = await db.rpc('claim_cleaner_email_delivery', { p_email_id: entry.id, p_actor_id: actor.id })
    if (claimError) throw new Error('Unable to check recipient before delivery')
    if (!claimed) continue
    let outcome = 'sent'
    let providerId: string | null = null
    try {
      const response = await sendEmailOrThrow({
        from: batch.delivery.from, to: entry.to_email, replyTo: batch.delivery.replyTo,
        subject: entry.subject, html: entry.final_html_snapshot, text: entry.final_text_snapshot, headers: entry.delivery_headers,
      })
      providerId = response && typeof response === 'object' && 'id' in response ? String(response.id) : null
    } catch (error) {
      const pause = emailProviderPause(error)
      if (pause) {
        const { error: requeueError } = await db.from('cleaner_emails').update({ delivery_outcome: 'queued' }).eq('id', entry.id).eq('delivery_outcome', 'sending')
        if (requeueError) throw new Error('Delivery could not be paused; check its status before continuing.')
        paused = pause === 'quota'
        break
      }
      // Only explicit rejection establishes non-acceptance. Network/SDK-wrapped errors stay unknown.
      outcome = error instanceof EmailProviderRejectedError && ['validation_error', 'missing_required_field', 'invalid_access', 'invalid_api_key'].includes(error.providerErrorName || '') ? 'failed' : 'unknown'
    }
    const { error: outcomeError } = await db.rpc('complete_cleaner_email_delivery', {
      p_email_id: entry.id, p_actor_id: actor.id, p_outcome: outcome, p_provider_id: providerId,
    })
    if (outcomeError) throw new Error('Delivery outcome could not be recorded; check before sending again')
  }
  return { ...await results(actor, requestId, false), paused }
}
