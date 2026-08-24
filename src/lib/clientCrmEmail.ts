import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { getAdminSupabase } from '@/lib/supabase'
import { getSiteUrl } from '@/lib/siteUrl'
import { writeAuditLogStrict } from '@/lib/auditLog'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { actorCanAccessLead } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmData'
import {
  applyCrmTemplateTokens,
  getMissingCrmSignatureFields,
  normalizeCrmEmail,
} from '@/lib/clientCrmPolicy'

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin: 0 0 16px;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function safeHeaderName(value: string) {
  return value.replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

function getVerifiedFromAddress(value: string) {
  const candidate = value.trim()
  const bracketed = candidate.match(/<([^<>]+)>/)?.[1]?.trim() ?? candidate
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(bracketed)
    ? bracketed
    : 'quotes@securecleaning.com.au'
}

function getProviderMessageId(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const id = (value as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

export function buildCrmSignature(account: Pick<ClientCrmActor, 'displayName' | 'jobTitle' | 'phone' | 'email'>) {
  return [
    'Kind regards,',
    '',
    account.displayName,
    account.jobTitle,
    'Secure Cleaning Aus',
    account.phone,
    account.email,
    'securecleaning.com.au',
    'ABN 81 674 121 825',
  ].join('\n')
}

export function buildCrmFooter(sourceExplanation: string, unsubscribeUrl: string) {
  return [
    `You are receiving this email because ${sourceExplanation}.`,
    `To stop receiving marketing emails from Secure Cleaning Aus, unsubscribe here: ${unsubscribeUrl}`,
    'Secure Cleaning Aus | securecleaning.com.au | ABN 81 674 121 825',
  ].join('\n')
}

export async function sendClientCrmEmail(actor: ClientCrmActor, input: Record<string, unknown>) {
  const leadId = clean(input.leadId, 100)
  const templateId = clean(input.templateId, 100)
  const idempotencyKey = clean(input.idempotencyKey, 100)
  const requestedSubject = clean(input.subject, 240)
  const requestedBody = clean(input.body, 10000)
  if (!leadId || !requestedSubject || !requestedBody || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    throw new ClientCrmError('Lead, subject, message, and a valid send request are required.')
  }
  const missingSignature = getMissingCrmSignatureFields(actor)
  if (missingSignature.length > 0) {
    throw new ClientCrmError(`Complete your Team Access email signature before sending: ${missingSignature.join(', ')}.`, 409)
  }

  const db = getAdminSupabase()
  const { data: existing } = await db.from('crm_communications')
    .select('id, status, sent_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing) return { id: existing.id, status: existing.status, sentAt: existing.sent_at, duplicate: true }

  const { data: lead, error: leadError } = await db.from('leads')
    .select('id, organisation_id, contact_id, quote_id, email, business_name, contact_name, suburb, postcode, source, source_provider, source_explanation, contact_basis, assigned_staff_id')
    .eq('id', leadId)
    .maybeSingle()
  if (leadError) throw leadError
  if (!lead || !actorCanAccessLead(actor, lead.assigned_staff_id)) throw new ClientCrmError('Lead not found.', 404)
  if (!lead.contact_id) throw new ClientCrmError('Add a client contact before sending email.', 409)
  if (!lead.contact_basis || !lead.source_explanation) {
    throw new ClientCrmError('Record the contact basis and source explanation before sending.', 409)
  }

  const { data: contact, error: contactError } = await db.from('clients')
    .select('id, email, contact_name, unsubscribe_token')
    .eq('id', lead.contact_id)
    .maybeSingle()
  if (contactError) throw contactError
  if (!contact) throw new ClientCrmError('Client contact not found.', 404)
  const recipient = normalizeCrmEmail(contact.email)
  if (!recipient || recipient !== normalizeCrmEmail(lead.email)) {
    throw new ClientCrmError('The saved lead and client contact emails do not match. Review the record before sending.', 409)
  }

  const purpose = 'marketing' as const
  let templateVersion: number | null = null
  if (templateId) {
    const { data: template, error: templateError } = await db.from('crm_email_templates')
      .select('id, visibility, status, created_by_staff_id, current_version')
      .eq('id', templateId)
      .maybeSingle()
    if (templateError) throw templateError
    if (!template || template.status === 'archived') throw new ClientCrmError('Email template not found.', 404)
    if (template.visibility === 'personal' && template.created_by_staff_id !== actor.id) throw new ClientCrmError('Email template not found.', 404)
    if (actor.role === 'agent' && template.status !== 'published' && template.created_by_staff_id !== actor.id) {
      throw new ClientCrmError('Email template not found.', 404)
    }
    templateVersion = Number(template.current_version ?? 1)
  }

  const contactName = String(contact.contact_name ?? lead.contact_name ?? '')
  const tokens = {
    business_name: String(lead.business_name ?? ''),
    contact_name: contactName,
    first_name: contactName.split(/\s+/)[0] ?? '',
    suburb: String(lead.suburb ?? ''),
    postcode: String(lead.postcode ?? ''),
    lead_source: String(lead.source_provider ?? 'Secure Cleaning Aus'),
  }
  const subject = applyCrmTemplateTokens(requestedSubject, tokens)
  const body = applyCrmTemplateTokens(requestedBody, tokens)
  const { data: suppression, error: suppressionError } = await db.from('crm_email_suppressions')
    .select('reason')
    .eq('email_normalized', recipient)
    .maybeSingle()
  if (suppressionError) throw suppressionError
  if (suppression) throw new ClientCrmError('This contact has unsubscribed or cannot receive email from the CRM.', 409)

  const { data: unresolved, error: unresolvedError } = await db.from('crm_communications')
    .select('id, status')
    .eq('contact_id', contact.id)
    .in('status', ['sending', 'unknown'])
    .limit(1)
    .maybeSingle()
  if (unresolvedError) throw unresolvedError
  if (unresolved) {
    throw new ClientCrmError('A previous email has an unresolved delivery outcome. Reconcile that activity before sending again.', 409)
  }

  const signature = buildCrmSignature(actor)
  const unsubscribeUrl = `${getSiteUrl()}/unsubscribe?token=${contact.unsubscribe_token}`
  const oneClickUnsubscribeUrl = `${getSiteUrl()}/api/email-preferences/unsubscribe?token=${contact.unsubscribe_token}`
  const sourceExplanation = String(lead.source_explanation)
  const footer = buildCrmFooter(sourceExplanation, unsubscribeUrl)
  const fromAddress = getVerifiedFromAddress(process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au')
  const fromHeader = `${safeHeaderName(actor.displayName)} - Secure Cleaning Aus <${fromAddress}>`

  const { data: communication, error: insertError } = await db.from('crm_communications').insert({
    lead_id: lead.id,
    organisation_id: lead.organisation_id,
    contact_id: contact.id,
    template_id: templateId || null,
    template_version: templateVersion,
    purpose,
    idempotency_key: idempotencyKey,
    to_email: recipient,
    from_email: fromAddress,
    reply_to_email: actor.email,
    sender_staff_id: actor.id,
    sender_name: actor.displayName,
    subject_snapshot: subject,
    body_snapshot: body,
    signature_snapshot: signature,
    source_snapshot: sourceExplanation,
    footer_snapshot: footer,
    status: 'sending',
  }).select('id').single()
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: claimed } = await db.from('crm_communications').select('id, status, sent_at').eq('idempotency_key', idempotencyKey).single()
      if (claimed) return { id: claimed.id, status: claimed.status, sentAt: claimed.sent_at, duplicate: true }
      throw new ClientCrmError('Another email send is already unresolved for this client. Reconcile it before sending again.', 409)
    }
    throw insertError
  }

  let response: unknown
  try {
    response = await sendEmailOrThrow({
      from: fromHeader,
      to: recipient,
      replyTo: actor.email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.55;">
          <div style="background: #1a2744; padding: 20px 24px;"><strong style="color: white; font-size: 20px;">Secure Cleaning Aus</strong></div>
          <div style="padding: 24px;">${textToHtml(body)}<div style="margin-top: 28px;">${textToHtml(signature)}</div></div>
          <div style="border-top: 1px solid #e5e7eb; padding: 18px 24px; color: #6b7280; font-size: 12px;">
            <p style="margin: 0 0 10px;">You are receiving this email because ${escapeHtml(sourceExplanation)}.</p>
            <p style="margin: 0 0 10px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color: #0f766e;">Unsubscribe from marketing emails</a></p>
            <p style="margin: 0;">Secure Cleaning Aus | securecleaning.com.au | ABN 81 674 121 825</p>
          </div>
        </div>
      `,
      headers: {
        'List-Unsubscribe': `<${oneClickUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
  } catch (error) {
    const status = error instanceof EmailProviderRejectedError ? 'rejected' : 'unknown'
    await db.from('crm_communications').update({
      status,
      failure_code: error instanceof EmailProviderRejectedError ? 'provider_rejected' : 'provider_outcome_unknown',
    }).eq('id', communication.id).eq('status', 'sending')
    await writeAuditLogStrict('lead', lead.id, 'crm.email.failed', {
      actorId: actor.id,
      communicationId: communication.id,
      status,
    })
    throw new ClientCrmError(
      status === 'unknown'
        ? 'The email provider outcome is uncertain. Check the activity history before trying again.'
        : 'The email provider rejected this message.',
      502,
    )
  }

  const providerMessageId = getProviderMessageId(response)
  const sentAt = new Date().toISOString()
  const { error: finalizeError } = await db.rpc('finalize_client_crm_communication', {
    p_communication_id: communication.id,
    p_provider_message_id: providerMessageId,
    p_sent_at: sentAt,
    p_audit_details: {
      actorId: actor.id,
      communicationId: communication.id,
      templateId: templateId || null,
      purpose,
    },
  })
  if (finalizeError) {
    await db.from('crm_communications').update({
      status: 'unknown',
      failure_code: 'provider_accepted_finalize_failed',
    }).eq('id', communication.id).eq('status', 'sending')
    throw new ClientCrmError('The email provider accepted this message, but local finalisation failed. Do not resend until the activity is reconciled.', 502)
  }
  return { id: communication.id, status: 'sent', sentAt, duplicate: false }
}

export async function unsubscribeCrmContact(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false
  const db = getAdminSupabase()
  const { data, error } = await db.rpc('unsubscribe_client_crm_contact', { p_token: token })
  if (error) throw error
  return data === true
}
