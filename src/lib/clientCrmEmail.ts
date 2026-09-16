import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { getAdminSupabase } from '@/lib/supabase'
import { getSiteUrl } from '@/lib/siteUrl'
import { writeAuditLogStrict } from '@/lib/auditLog'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { actorCanAccessOpportunity } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmData'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import {
  applyCrmTemplateTokens,
  canAccessClientCrm,
  canActorSendCrmEmailAs,
  getMissingCrmSignatureFields,
  normalizeCrmEmail,
} from '@/lib/clientCrmPolicy'
import { parseRichEmailContent, richEmailFingerprint, sanitizeRichEmailHtml } from '@/lib/richEmailServer'
import type { RichEmailContent } from '@/lib/richEmailContent'
import { CLIENT_EMAIL_MERGE_FIELD_KEYS, findUnsupportedEmailMergeFields } from '@/lib/emailMergeFields'

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
    'Secure Cleaning',
    account.phone,
    account.email,
    'securecleaning.com.au',
  ].join('\n')
}

export function buildCrmFooter(sourceExplanation: string, unsubscribeUrl: string) {
  return [
    `You are receiving this email because ${sourceExplanation}.`,
    `To stop receiving marketing emails from Secure Cleaning, unsubscribe here: ${unsubscribeUrl}`,
    'Secure Cleaning | securecleaning.com.au',
  ].join('\n')
}

function buildClientCrmHtml(parts: {
  bodyHtml: string
  signature: string
  sourceExplanation: string
  unsubscribeUrl: string
}) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.55;">
      <div style="background: #1a2744; padding: 20px 24px;"><strong style="color: white; font-size: 20px;">Secure Cleaning</strong></div>
      <div style="padding: 24px;">${parts.bodyHtml}<div style="margin-top: 28px;">${textToHtml(parts.signature)}</div></div>
      <div style="border-top: 1px solid #e5e7eb; padding: 18px 24px; color: #6b7280; font-size: 12px;">
        <p style="margin: 0 0 10px;">You are receiving this email because ${escapeHtml(parts.sourceExplanation)}.</p>
        <p style="margin: 0 0 10px;"><a href="${escapeHtml(parts.unsubscribeUrl)}" style="color: #0f766e;">Unsubscribe from marketing emails</a></p>
        <p style="margin: 0;">Secure Cleaning | securecleaning.com.au</p>
      </div>
    </div>
  `.trim()
}

async function prepareClientCrmEmail(actor: ClientCrmActor, input: Record<string, unknown>) {
  const opportunityId = clean(input.opportunityId, 100)
  const senderStaffId = clean(input.senderStaffId, 100) || actor.id
  const templateId = clean(input.templateId, 100)
  const requestedSubject = clean(input.subject, 240)
  let requestedContent: RichEmailContent
  try {
    requestedContent = parseRichEmailContent(input)
  } catch (error) {
    throw new ClientCrmError(error instanceof Error ? error.message : 'Message content is required.')
  }
  if (!opportunityId || !requestedSubject) {
    throw new ClientCrmError('Opportunity, subject, and message are required.')
  }
  const unsupportedFields = findUnsupportedEmailMergeFields(
    CLIENT_EMAIL_MERGE_FIELD_KEYS,
    requestedSubject,
    requestedContent.text,
    requestedContent.html,
  )
  if (unsupportedFields.length > 0) {
    throw new ClientCrmError(`Remove or correct unsupported database fields: ${unsupportedFields.join(', ')}.`)
  }
  if (!canActorSendCrmEmailAs(actor.role, actor.id, senderStaffId)) {
    throw new ClientCrmError('You cannot send client email as that team member.', 403)
  }
  const sender = await getStaffAccountProfileById(senderStaffId)
  if (!sender?.active || !canAccessClientCrm(sender.role)) {
    throw new ClientCrmError('Select an active team member who can send client email.', 409)
  }
  const missingSignature = getMissingCrmSignatureFields(sender)
  if (missingSignature.length > 0) {
    throw new ClientCrmError(`Complete the selected sender's Team Access email signature before sending: ${missingSignature.join(', ')}.`, 409)
  }

  const db = getAdminSupabase()
  const { data: opportunity, error: opportunityError } = await db.from('crm_opportunities')
    .select('id, organisation_id, primary_contact_id, site_id, assigned_staff_id')
    .eq('id', opportunityId)
    .maybeSingle()
  if (opportunityError) throw opportunityError
  if (!opportunity || !actorCanAccessOpportunity(actor, opportunity.assigned_staff_id)) throw new ClientCrmError('Opportunity not found.', 404)

  const { data: intakeLink, error: intakeLinkError } = await db.from('crm_opportunity_intakes')
    .select('lead_id')
    .eq('opportunity_id', opportunity.id)
    .order('linked_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (intakeLinkError) throw intakeLinkError
  const { data: intake, error: intakeError } = intakeLink?.lead_id
    ? await db.from('leads')
      .select('id, email, business_name, contact_name, address, suburb, postcode, city, state, source_provider, source_explanation, contact_basis')
      .eq('id', intakeLink.lead_id)
      .maybeSingle()
    : { data: null, error: null }
  if (intakeError) throw intakeError
  if (!intake?.contact_basis || !intake.source_explanation) {
    throw new ClientCrmError('Record the contact basis and source explanation before sending.', 409)
  }

  const [contactResult, organisationResult, siteResult] = await Promise.all([
    db.from('clients')
      .select('id, email, phone, contact_name, first_name, last_name, position_title, unsubscribe_token')
      .eq('id', opportunity.primary_contact_id)
      .maybeSingle(),
    db.from('crm_organisations')
      .select('id, business_name')
      .eq('id', opportunity.organisation_id)
      .maybeSingle(),
    opportunity.site_id
      ? db.from('sites')
        .select('id, site_name, address, suburb, postcode, city')
        .eq('id', opportunity.site_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (contactResult.error) throw contactResult.error
  if (organisationResult.error) throw organisationResult.error
  if (siteResult.error) throw siteResult.error
  const contact = contactResult.data
  const organisation = organisationResult.data
  const site = siteResult.data
  if (!contact) throw new ClientCrmError('Client contact not found.', 404)
  const recipient = normalizeCrmEmail(contact.email)
  if (!recipient || recipient !== normalizeCrmEmail(intake.email)) {
    throw new ClientCrmError('The saved intake and contact emails do not match. Review the record before sending.', 409)
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

  const contactName = String(contact.contact_name ?? intake.contact_name ?? '')
  const firstName = String(contact.first_name ?? '').trim() || contactName.split(/\s+/)[0] || ''
  const lastName = String(contact.last_name ?? '').trim() || contactName.split(/\s+/).slice(1).join(' ')
  const businessName = String(organisation?.business_name ?? intake.business_name ?? '')
  const city = String(site?.city ?? intake.city ?? '')
  const cityLabel = city ? city.replace(/^\w/, (letter) => letter.toUpperCase()) : ''
  const state = String(intake.state ?? '').trim() || (city === 'sydney' ? 'NSW' : city === 'melbourne' ? 'VIC' : '')
  const address = String(site?.address ?? intake.address ?? '')
  const leadSource = String(intake.source_provider ?? 'Secure Cleaning')
  const tokens = {
    business_name: businessName,
    company: businessName,
    contact_name: contactName,
    name: contactName,
    first_name: firstName,
    last_name: lastName,
    position_title: String(contact.position_title ?? ''),
    email: recipient,
    phone: String(contact.phone ?? ''),
    site_name: String(site?.site_name ?? ''),
    address,
    site_address: address,
    suburb: String(site?.suburb ?? intake.suburb ?? ''),
    postcode: String(site?.postcode ?? intake.postcode ?? ''),
    city: cityLabel,
    state,
    lead_source: leadSource,
    source_provider: leadSource,
  }
  const subject = applyCrmTemplateTokens(requestedSubject, tokens)
  const htmlTokens = Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, escapeHtml(value)]))
  const content = {
    document: requestedContent.document,
    html: sanitizeRichEmailHtml(applyCrmTemplateTokens(requestedContent.html, htmlTokens)),
    text: applyCrmTemplateTokens(requestedContent.text, tokens),
  }

  const signature = buildCrmSignature(sender)
  const unsubscribeUrl = `${getSiteUrl()}/unsubscribe?token=${contact.unsubscribe_token}`
  const oneClickUnsubscribeUrl = `${getSiteUrl()}/api/email-preferences/unsubscribe?token=${contact.unsubscribe_token}`
  const sourceExplanation = String(intake.source_explanation)
  const footer = buildCrmFooter(sourceExplanation, unsubscribeUrl)
  const fromAddress = getVerifiedFromAddress(process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au')
  const fromHeader = `${safeHeaderName(sender.displayName)} - Secure Cleaning <${fromAddress}>`
  const finalHtml = buildClientCrmHtml({ bodyHtml: content.html, signature, sourceExplanation, unsubscribeUrl })
  const finalText = `${content.text}\n\n${signature}\n\n${footer}`
  const previewFingerprint = richEmailFingerprint({ subject, html: finalHtml, text: finalText, context: JSON.stringify([opportunity.id, recipient, fromHeader, sender.email]) })

  return {
    db,
    opportunity,
    contact,
    sender,
    templateId,
    templateVersion,
    purpose,
    recipient,
    subject,
    content,
    signature,
    sourceExplanation,
    footer,
    fromAddress,
    fromHeader,
    unsubscribeUrl,
    oneClickUnsubscribeUrl,
    finalHtml,
    finalText,
    previewFingerprint,
  }
}

export async function previewClientCrmEmail(actor: ClientCrmActor, input: Record<string, unknown>) {
  const prepared = await prepareClientCrmEmail(actor, input)
  return {
    subject: prepared.subject,
    from: prepared.fromHeader,
    to: prepared.recipient,
    cc: prepared.sender.email,
    html: prepared.finalHtml,
    text: prepared.finalText,
    previewFingerprint: prepared.previewFingerprint,
  }
}

export async function sendClientCrmEmail(actor: ClientCrmActor, input: Record<string, unknown>) {
  const idempotencyKey = clean(input.idempotencyKey, 100)
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    throw new ClientCrmError('A valid send request is required.')
  }
  const prepared = await prepareClientCrmEmail(actor, input)
  const {
    db, opportunity, contact, sender, templateId, templateVersion, purpose, recipient, subject,
    content, signature, sourceExplanation, footer, fromAddress, fromHeader, oneClickUnsubscribeUrl,
    finalHtml, finalText, previewFingerprint,
  } = prepared
  if (clean(input.previewFingerprint, 100) !== previewFingerprint) {
    throw new ClientCrmError('Preview this exact email before sending it.', 409)
  }

  const { data: existing } = await db.from('crm_communications')
    .select('id, status, sent_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing) return { id: existing.id, status: existing.status, sentAt: existing.sent_at, duplicate: true }

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

  const { data: communicationId, error: insertError } = await db.rpc('claim_client_crm_communication', {
    p_opportunity_id: opportunity.id,
    p_actor_id: actor.id,
    p_organisation_id: opportunity.organisation_id,
    p_contact_id: contact.id,
    p_template_id: templateId || null,
    p_template_version: templateVersion,
    p_purpose: purpose,
    p_idempotency_key: idempotencyKey,
    p_to_email: recipient,
    p_from_email: fromAddress,
    p_reply_to_email: sender.email,
    p_sender_staff_id: sender.id,
    p_sender_name: sender.displayName,
    p_subject: subject,
    p_body: content.text,
    p_signature: signature,
    p_source: sourceExplanation,
    p_footer: footer,
    p_actor_role: actor.role,
  })
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: claimed } = await db.from('crm_communications').select('id, status, sent_at').eq('idempotency_key', idempotencyKey).single()
      if (claimed) return { id: claimed.id, status: claimed.status, sentAt: claimed.sent_at, duplicate: true }
      throw new ClientCrmError('Another email send is already unresolved for this client. Reconcile it before sending again.', 409)
    }
    throw insertError
  }
  if (!communicationId) throw new ClientCrmError('The email could not be claimed for sending.', 409)

  const { error: snapshotError } = await db.from('crm_communications').update({
    body_document_snapshot: content.document,
    body_html_snapshot: content.html,
    final_html_snapshot: finalHtml,
    final_text_snapshot: finalText,
  }).eq('id', communicationId).eq('status', 'sending')
  if (snapshotError) {
    await db.from('crm_communications').update({
      status: 'rejected',
      failure_code: 'snapshot_write_failed',
    }).eq('id', communicationId).eq('status', 'sending')
    throw snapshotError
  }

  let response: unknown
  try {
    response = await sendEmailOrThrow({
      from: fromHeader,
      to: recipient,
      cc: sender.email,
      replyTo: sender.email,
      subject,
      html: finalHtml,
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
    }).eq('id', communicationId).eq('status', 'sending')
    await writeAuditLogStrict('crm_opportunity', opportunity.id, 'crm.email.failed', {
      actorId: actor.id,
      senderStaffId: sender.id,
      communicationId,
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
    p_communication_id: communicationId,
    p_provider_message_id: providerMessageId,
    p_sent_at: sentAt,
    p_audit_details: {
      actorId: actor.id,
      senderStaffId: sender.id,
      communicationId,
      templateId: templateId || null,
      purpose,
    },
  })
  if (finalizeError) {
    await db.from('crm_communications').update({
      status: 'unknown',
      failure_code: 'provider_accepted_finalize_failed',
    }).eq('id', communicationId).eq('status', 'sending')
    throw new ClientCrmError('The email provider accepted this message, but local finalisation failed. Do not resend until the activity is reconciled.', 502)
  }
  return { id: communicationId, status: 'sent', sentAt, duplicate: false }
}

export async function unsubscribeCrmContact(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false
  const db = getAdminSupabase()
  const { data, error } = await db.rpc('unsubscribe_client_crm_contact', { p_token: token })
  if (error) throw error
  return data === true
}
