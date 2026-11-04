import { escapeHtml } from '@/lib/htmlEscape'
import { writeAuditLog } from '@/lib/auditLog'
import { buildBookingCancellationIcs, buildBookingInviteIcs, getCityTimeZone } from '@/lib/calendarInvite'
import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import type { BookingInputs } from '@/lib/types'

type AppointmentChange = 'rescheduled' | 'cancelled'
type RecipientKind = 'client' | 'agent'
export type AppointmentNotificationStatus = 'sent' | 'failed' | 'review_required' | 'skipped'

export type AppointmentNotificationOutcome = {
  recipient: RecipientKind
  status: AppointmentNotificationStatus
  providerMessageId: string | null
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function appointmentLabel(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'the previously scheduled time'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function notificationHtml(input: {
  bookingRef: string
  inputs: BookingInputs
  change: AppointmentChange
  recipient: RecipientKind
  previousScheduledFor: string
  scheduledFor: string | null
  agentName: string
}) {
  const business = input.inputs.businessName?.trim() || 'the client site'
  const timeZone = getCityTimeZone(input.inputs.city)
  const oldTime = appointmentLabel(input.previousScheduledFor, timeZone)
  const newTime = input.scheduledFor ? appointmentLabel(input.scheduledFor, timeZone) : null
  const greeting = input.recipient === 'client'
    ? input.inputs.contactName?.trim() || 'there'
    : input.agentName || 'there'
  const actionCopy = input.change === 'cancelled'
    ? `The Secure Cleaning site inspection for <strong>${escapeHtml(business)}</strong>, previously scheduled for <strong>${escapeHtml(oldTime)}</strong>, has been cancelled.`
    : `The Secure Cleaning site inspection for <strong>${escapeHtml(business)}</strong> has been changed from <strong>${escapeHtml(oldTime)}</strong> to <strong>${escapeHtml(newTime || '')}</strong>.`
  const contactDetails = input.recipient === 'agent'
    ? `<p><strong>Client contact:</strong> ${escapeHtml(input.inputs.contactName)}<br><strong>Phone:</strong> ${escapeHtml(input.inputs.phone)}<br><strong>Address:</strong> ${escapeHtml(input.inputs.address)}, ${escapeHtml(input.inputs.suburb)} ${escapeHtml(input.inputs.postcode)}</p>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a2744">
      <div style="background:#1a2744;padding:24px;text-align:center"><h1 style="color:#fff;margin:0">Secure Cleaning</h1></div>
      <div style="padding:28px 24px">
        <p>Hi ${escapeHtml(greeting)},</p>
        <p>${actionCopy}</p>
        ${contactDetails}
        <p><strong>Booking reference:</strong> ${escapeHtml(input.bookingRef)}</p>
        <p>${input.change === 'rescheduled' ? 'An updated calendar invitation is attached.' : 'A calendar cancellation is attached.'}</p>
        <p>If you have any questions, please reply to this email.</p>
      </div>
      <div style="background:#f1f5f9;padding:16px;text-align:center;color:#64748b;font-size:12px">Secure Cleaning</div>
    </div>`
}

export async function sendAppointmentChangeNotifications(input: {
  bookingRef: string
  inputs: BookingInputs
  change: AppointmentChange
  previousScheduledFor: string
  scheduledFor: string | null
  agentEmail?: string
  agentName: string
  revision: number
}): Promise<AppointmentNotificationOutcome[]> {
  const business = (input.inputs.businessName?.trim() || 'client site').replace(/[\r\n]+/g, ' ')
  let calendar: string | null = null
  try {
    calendar = input.change === 'cancelled'
      ? buildBookingCancellationIcs(input.bookingRef, input.inputs, input.revision)
      : buildBookingInviteIcs(input.bookingRef, input.inputs, input.revision)
  } catch (error) {
    console.error('[bookingAppointmentNotifications] Calendar attachment could not be prepared:', error)
  }
  const recipients: Array<{ kind: RecipientKind; email: string | undefined }> = [
    { kind: 'client', email: input.inputs.email },
    { kind: 'agent', email: input.agentEmail },
  ]
  const outcomes: AppointmentNotificationOutcome[] = []

  for (const recipient of recipients) {
    if (!validEmail(recipient.email)) {
      const outcome: AppointmentNotificationOutcome = { recipient: recipient.kind, status: 'skipped', providerMessageId: null }
      outcomes.push(outcome)
      await writeAuditLog('booking', input.bookingRef, 'appointment.notification.skipped', {
        recipient_kind: recipient.kind,
        change: input.change,
        revision: input.revision,
        reason: 'Recipient email is not configured or invalid.',
      })
      continue
    }

    let status: AppointmentNotificationStatus = 'review_required'
    let providerMessageId: string | null = null
    let deliveryError: string | null = null
    try {
      const result = await sendEmailOrThrow({
        from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au',
        to: recipient.email.trim().toLowerCase(),
        replyTo: process.env.ADMIN_EMAIL ?? 'info@securecleaning.com.au',
        subject: `Inspection appointment ${input.change === 'cancelled' ? 'cancelled' : 'updated'} — ${business}`,
        html: notificationHtml({ ...input, recipient: recipient.kind }),
        attachments: calendar ? [{
          filename: `${input.bookingRef}-${input.change}.ics`,
          content: Buffer.from(calendar, 'utf8').toString('base64'),
          content_type: 'text/calendar',
        }] : [],
      }, { idempotencyKey: `booking-appointment-${input.bookingRef}-${input.revision}-${input.change}-${recipient.kind}` }) as { id?: string } | null
      providerMessageId = result?.id ?? null
      status = providerMessageId ? 'sent' : 'review_required'
    } catch (error) {
      status = error instanceof EmailProviderRejectedError ? 'failed' : 'review_required'
      deliveryError = error instanceof Error ? error.message : 'Email delivery outcome is unknown.'
    }

    outcomes.push({ recipient: recipient.kind, status, providerMessageId })
    await writeAuditLog('booking', input.bookingRef, `appointment.notification.${status}`, {
      recipient_kind: recipient.kind,
      change: input.change,
      revision: input.revision,
      provider_message_id: providerMessageId,
      delivery_error: deliveryError,
    })
  }

  return outcomes
}
