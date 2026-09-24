import 'server-only'

import { getAdminSupabase } from '@/lib/supabase'
import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { getSiteUrl } from '@/lib/siteUrl'
import { getJobsAccessLink } from '@/lib/contractProducts'

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'info@securecleaning.com.au'

type InterestAudience = 'cleaner' | 'agent'

type ProductInterestContext = {
  id: string
  productCode: string
  heading: string
  state: string
  suburb: string
  assignedStaffId: string | null
}

type CleanerMatch = {
  id: string
  contactName: string
  email: string
  phone: string | null
}

type AgentRecipient = {
  staffId: string | null
  name: string
  email: string
  productUrl: string
}

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function resolveAgentRecipient(product: ProductInterestContext): Promise<AgentRecipient> {
  const siteUrl = getSiteUrl()
  if (product.assignedStaffId) {
    const { data: staff, error } = await getAdminSupabase().from('admin_staff_accounts')
      .select('id, display_name, email, active, availability_assignee_id')
      .eq('id', product.assignedStaffId).maybeSingle()
    if (error) throw error
    const email = clean(staff?.email, 320).toLowerCase()
    if (staff?.active && validEmail(email)) {
      const assigneeId = clean(staff.availability_assignee_id, 160)
      return {
        staffId: String(staff.id),
        name: clean(staff.display_name, 160) || 'Secure Cleaning agent',
        email,
        productUrl: assigneeId
          ? `${siteUrl}/availability/products/${encodeURIComponent(assigneeId)}?product=${encodeURIComponent(product.id)}`
          : `${siteUrl}/admin/products?product=${encodeURIComponent(product.id)}`,
      }
    }
  }
  return {
    staffId: null,
    name: 'Secure Cleaning owner',
    email: ADMIN_EMAIL,
    productUrl: `${siteUrl}/admin/products?product=${encodeURIComponent(product.id)}`,
  }
}

async function sendTrackedNotification(input: {
  interestId: string
  audience: InterestAudience
  recipient: string
  notifiedStaffId?: string | null
  replyTo: string
  subject: string
  html: string
}) {
  const db = getAdminSupabase()
  const { data: existing, error: existingError } = await db.from('contract_product_interest_notifications')
    .select('id, status').eq('interest_id', input.interestId).eq('audience', input.audience).maybeSingle()
  if (existingError) throw existingError
  if (existing && ['sending', 'sent', 'unknown'].includes(String(existing.status))) return

  const now = new Date().toISOString()
  const { data: delivery, error: deliveryError } = await db.from('contract_product_interest_notifications').upsert({
    interest_id: input.interestId,
    audience: input.audience,
    recipient_email: input.recipient,
    notified_staff_id: input.notifiedStaffId ?? null,
    status: 'sending',
    provider_message_id: null,
    failure_message: null,
    attempted_at: now,
    sent_at: null,
  }, { onConflict: 'interest_id,audience' }).select('id').single()
  if (deliveryError) throw deliveryError

  let providerAccepted = false
  try {
    const result = await sendEmailOrThrow({
      from: FROM_EMAIL,
      to: input.recipient,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
    }) as { id?: string } | null
    providerAccepted = true
    const { error } = await db.from('contract_product_interest_notifications').update({
      status: 'sent',
      provider_message_id: result?.id ?? null,
      failure_message: null,
      sent_at: new Date().toISOString(),
    }).eq('id', delivery.id)
    if (error) throw error
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.'
    const definitelyRejected = error instanceof EmailProviderRejectedError || message.includes('Email service is not configured')
    const { error: updateError } = await db.from('contract_product_interest_notifications').update({
      status: providerAccepted || !definitelyRejected ? 'unknown' : 'failed', failure_message: message,
    }).eq('id', delivery.id)
    if (updateError) console.error('[contractProductInterest] Failed to record email failure:', updateError)
    throw error
  }
}

async function sendInterestNotifications(input: {
  interestId: string
  product: ProductInterestContext
  cleaner: CleanerMatch | null
  submittedEmail: string
  note: string
}) {
  const agent = await resolveAgentRecipient(input.product)
  const noteHtml = input.note ? `<p><strong>Note:</strong><br>${escapeHtml(input.note).replaceAll('\n', '<br>')}</p>` : ''
  const matchLabel = input.cleaner ? 'Approved cleaner profile matched' : 'No approved cleaner profile matched'
  const cleanerDetails = input.cleaner
    ? `<p><strong>${escapeHtml(input.cleaner.contactName)}</strong><br>${escapeHtml(input.cleaner.email)}${input.cleaner.phone ? `<br>${escapeHtml(input.cleaner.phone)}` : ''}</p>`
    : `<p><strong>Submitted email:</strong> <a href="mailto:${escapeHtml(input.submittedEmail)}">${escapeHtml(input.submittedEmail)}</a></p><p>No job details or confirmation email were sent to this address.</p>`
  const agentDelivery = sendTrackedNotification({
    interestId: input.interestId,
    audience: 'agent',
    recipient: agent.email,
    notifiedStaffId: agent.staffId,
    replyTo: input.submittedEmail,
    subject: `${input.cleaner ? 'Cleaner interest' : 'New cleaner lead'} — ${input.product.productCode}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Interest in ${escapeHtml(input.product.productCode)}</h2><p>${escapeHtml(matchLabel)}</p>${cleanerDetails}${noteHtml}<p><a href="${escapeHtml(agent.productUrl)}">Open contract product</a></p></div>`,
  })

  const deliveries: Promise<void>[] = [agentDelivery]
  if (input.cleaner) {
    deliveries.push(sendTrackedNotification({
      interestId: input.interestId,
      audience: 'cleaner',
      recipient: input.cleaner.email,
      replyTo: agent.email,
      subject: `Interest received — ${input.product.productCode}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><p>Hi ${escapeHtml(input.cleaner.contactName)},</p><p>We have recorded your interest in <strong>${escapeHtml(input.product.productCode)}</strong>, ${escapeHtml(input.product.heading)} in ${escapeHtml(input.product.suburb)}, ${escapeHtml(input.product.state)}.</p><p>${escapeHtml(agent.name)} will contact you about the next step.</p><p>Secure Cleaning</p></div>`,
    }))
  }

  const results = await Promise.allSettled(deliveries)
  results.forEach((result) => {
    if (result.status === 'rejected') console.error('[contractProductInterest] Email delivery failed:', result.reason)
  })
}

export async function registerContractProductInterest(input: {
  productCode: string
  accessLinkId: string
  email: string
  note?: string
}) {
  const db = getAdminSupabase()
  const email = clean(input.email, 320).toLowerCase()
  if (!validEmail(email)) return { accepted: false as const }
  const accessLink = await getJobsAccessLink(input.accessLinkId)
  if (!accessLink) return { accepted: false as const }

  const { data: productRow, error: productError } = await db.from('contract_products')
    .select('id, product_code, heading, state, suburb, assigned_staff_id')
    .eq('product_code', clean(input.productCode, 80)).eq('status', 'available').maybeSingle()
  if (productError) throw productError
  if (!productRow || (accessLink.state && accessLink.state !== productRow.state)) return { accepted: false as const }
  const product: ProductInterestContext = {
    id: String(productRow.id),
    productCode: String(productRow.product_code),
    heading: String(productRow.heading ?? ''),
    state: String(productRow.state ?? ''),
    suburb: String(productRow.suburb ?? ''),
    assignedStaffId: typeof productRow.assigned_staff_id === 'string' ? productRow.assigned_staff_id : null,
  }

  const { data: cleanerRow, error: cleanerError } = await db.from('cleaners')
    .select('id, email, state, status, contact_name, phone').eq('email', email).maybeSingle()
  if (cleanerError) throw cleanerError
  const cleaner = cleanerRow?.status === 'approved' && String(cleanerRow.state ?? '').toUpperCase() === product.state
    ? {
      id: String(cleanerRow.id),
      contactName: clean(cleanerRow.contact_name, 160) || 'Cleaner',
      email,
      phone: clean(cleanerRow.phone, 40) || null,
    }
    : null
  const note = clean(input.note, 1000)
  const submittedAt = new Date().toISOString()
  const { data: interest, error: interestError } = await db.from('contract_product_interests').upsert({
    product_id: product.id,
    cleaner_id: cleaner?.id ?? null,
    access_link_id: input.accessLinkId,
    contact_name: cleaner?.contactName ?? 'Unregistered cleaner',
    email_normalized: email,
    phone: cleaner?.phone ?? null,
    note: note || null,
    match_status: cleaner ? 'approved_cleaner' : 'unmatched',
    last_submitted_at: submittedAt,
  }, { onConflict: 'product_id,email_normalized' }).select('id').single()
  if (interestError) throw interestError

  const { data: activity, error: activityError } = await db.from('contract_product_activity').insert({
    product_id: product.id,
    interest_id: interest.id,
    event_type: 'interest_registered',
    contact_name: cleaner?.contactName ?? 'Unregistered cleaner',
    email_normalized: email,
    phone: cleaner?.phone ?? null,
    note: note || null,
    match_status: cleaner ? 'approved_cleaner' : 'unmatched',
    interest_status: 'new',
    notification_status: 'pending',
    occurred_at: submittedAt,
  }).select('id').single()
  if (activityError) throw activityError

  await sendInterestNotifications({ interestId: String(interest.id), product, cleaner, submittedEmail: email, note })
  const { data: agentNotification, error: notificationError } = await db.from('contract_product_interest_notifications')
    .select('status').eq('interest_id', interest.id).eq('audience', 'agent').maybeSingle()
  if (notificationError) console.error('[contractProductInterest] Failed to load agent delivery status:', notificationError)
  else {
    const { error: activityUpdateError } = await db.from('contract_product_activity').update({
      notification_status: agentNotification?.status ?? 'pending',
    }).eq('id', activity.id)
    if (activityUpdateError) console.error('[contractProductInterest] Failed to update product activity delivery status:', activityUpdateError)
  }
  return { accepted: true as const, matched: Boolean(cleaner) }
}
