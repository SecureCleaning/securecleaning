import { escapeHtml } from './htmlEscape'
import { escapeIcsText, serializeIcs } from './ics'
import { buildBookingInviteIcs, getCityTimeZone, getDateTimeInTimeZone } from './calendarInvite'
import { sendEmailOrThrow } from './email'
import { getSiteUrl } from './siteUrl'
import type { BookingInputs } from './types'
import type { ProposedAppointment } from './partnerAppointmentPolicy'

type Notice = { requestId: string; bookingRef: string; inputs: BookingInputs; proposals: ProposedAppointment[]; agentEmail: string; state: 'pending' | 'confirmed' | 'declined'; selected?: number | null; contactReviewRequired?: boolean }
const utc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
export function proposalCalendar(input: Notice, index: number) {
  const proposal = input.proposals[index], start = getDateTimeInTimeZone(proposal.date, proposal.startTime, getCityTimeZone(input.inputs.city))
  const cancelled = input.state === 'declined' || (input.state === 'confirmed' && input.selected !== index)
  const pending = input.state === 'pending'
  const sender = process.env.FROM_EMAIL?.trim() || 'quotes@securecleaning.com.au'
  const organizer = sender.match(/<([^<>]+)>/)?.[1] || sender
  if (/[\r\n]/.test(sender) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(organizer) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.agentEmail)) throw new Error('Invalid calendar mailbox')
  const reviewUrl = `${getSiteUrl()}/availability/dashboard/${encodeURIComponent(input.inputs.preferredInspectionAssigneeId || '')}#appointment-requests`
  return serializeIcs(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Secure Cleaning//Appointment requests//EN',`METHOD:${cancelled ? 'CANCEL' : 'REQUEST'}`,'BEGIN:VEVENT',
    `UID:partner-${input.requestId}-${index}@securecleaning.com.au`,`DTSTAMP:${utc(new Date())}`,`SEQUENCE:${pending ? 0 : 1}`,
    `DTSTART:${utc(start)}`,`DTEND:${utc(new Date(start.getTime()+600000))}`,
    `STATUS:${cancelled ? 'CANCELLED' : pending ? 'TENTATIVE' : 'CONFIRMED'}`,`TRANSP:${pending || cancelled ? 'TRANSPARENT' : 'OPAQUE'}`,
    `ORGANIZER:mailto:${organizer}`,`ATTENDEE;RSVP=TRUE:mailto:${input.agentEmail}`,
    `SUMMARY:${escapeIcsText(`${pending ? 'REQUEST - TBA' : cancelled ? 'Cancelled option' : 'Confirmed inspection'}: ${input.inputs.businessName} (${input.bookingRef})`)}`,
    `LOCATION:${escapeIcsText(`${input.inputs.address}, ${input.inputs.suburb} ${input.inputs.postcode}`)}`,
    `DESCRIPTION:${escapeIcsText(`Customer: ${input.inputs.contactName}\nPhone: ${input.inputs.phone}\nInternal notes: ${input.inputs.notes || 'None'}\n${pending ? 'Proposed time only. Review and confirm in Secure Cleaning; accepting this calendar request alone does not confirm with the customer.' : 'Appointment request reviewed.'}\n${reviewUrl}`)}`,
    'END:VEVENT','END:VCALENDAR'])
}
export function partnerAppointmentPayloads(input: Notice) {
  const from = process.env.FROM_EMAIL?.trim() || 'quotes@securecleaning.com.au', admin = process.env.ADMIN_EMAIL?.trim() || 'info@securecleaning.com.au'
  const title = input.state === 'pending' ? 'Appointment request received - TBA' : input.state === 'confirmed' ? 'Site inspection confirmed' : 'Appointment time still to be arranged'
  const proposed = input.proposals.map(p=>`<li>${escapeHtml(p.date)} at ${escapeHtml(p.startTime)}</li>`).join('')
  const selected = input.selected == null ? null : input.proposals[input.selected]
  const details = `<p><strong>${escapeHtml(input.inputs.businessName)}</strong><br>${escapeHtml(input.inputs.address)}, ${escapeHtml(input.inputs.suburb)} ${escapeHtml(input.inputs.postcode)}</p>`
  const clientMessage = input.state === 'pending' ? 'Thank you for your appointment request. Your inspection is TBA and no time is confirmed yet. We will be in touch to confirm a suitable time.' : input.state === 'confirmed' ? `Your site inspection is confirmed for ${escapeHtml(selected!.date)} at ${escapeHtml(selected!.startTime)} (${escapeHtml(getCityTimeZone(input.inputs.city))}). A calendar invitation is attached.` : 'We could not confirm the proposed appointment times. Your inspection remains TBA. Our team will be in touch to arrange another time.'
  const client = { from, to: input.inputs.email, replyTo: admin, subject: `${title} - ${input.bookingRef}`,
    html: `<h2>Secure Cleaning</h2><p>Hi ${escapeHtml(input.inputs.contactName)},</p><p>${clientMessage}</p>${details}${input.state === 'pending' ? `<p>Requested times (local time, subject to confirmation):</p><ul>${proposed}</ul>` : ''}<p>Reference: ${escapeHtml(input.bookingRef)}</p><p>Kind regards,<br>Secure Cleaning</p>`,
    ...(input.state === 'confirmed' ? {attachments:[{filename:`${input.bookingRef}.ics`,content:Buffer.from(buildBookingInviteIcs(input.bookingRef,input.inputs)).toString('base64'),content_type:'text/calendar'}]} : {}) }
  const reviewUrl = `${getSiteUrl()}/availability/dashboard/${encodeURIComponent(input.inputs.preferredInspectionAssigneeId || '')}#appointment-requests`
  const staff = { from, to: Array.from(new Set([admin,input.agentEmail])), replyTo: admin, subject: `[${input.state === 'pending' ? 'Action required: appointment request' : title}] ${input.bookingRef}`,
    html: `<h2>${escapeHtml(title)}</h2>${details}${input.contactReviewRequired ? '<p><strong>Client details need review:</strong> This request was saved without linking an existing client. An administrator must check the submitted details before linking it to Client CRM. Existing client records have not been changed.</p>' : ''}<p>Contact: ${escapeHtml(input.inputs.contactName)}<br>Email: ${escapeHtml(input.inputs.email)}<br>Phone: ${escapeHtml(input.inputs.phone)}<br>Premises: ${escapeHtml(input.inputs.premisesType)}<br>Frequency: ${escapeHtml(input.inputs.frequency)}<br>Cleaning time preference: ${escapeHtml(input.inputs.timePreference)}</p><ul>${proposed}</ul>${selected ? `<p>Confirmed: ${escapeHtml(selected.date)} ${escapeHtml(selected.startTime)}</p>` : ''}<p><strong>Internal appointment notes:</strong><br>${escapeHtml(input.inputs.notes || 'None').replace(/\r?\n/g,'<br>')}</p><p>${input.state === 'pending' ? 'These are tentative requests, not reserved appointments. Confirm a time in Secure Cleaning before attending. Accepting a calendar request alone does not notify the customer.' : 'A separate customer notification is being sent. Unselected calendar options are cancelled.'}</p><p><a href="${escapeHtml(reviewUrl)}">Review appointment requests</a></p>`,
    attachments: input.proposals.map((_,i)=>({filename:`${input.bookingRef}-option-${i+1}.ics`,content:Buffer.from(proposalCalendar(input,i)).toString('base64'),content_type:'text/calendar'})) }
  return {client,staff}
}
export async function sendPartnerAppointmentNotice(input: Notice) {
  const {client,staff} = partnerAppointmentPayloads(input)
  // A persisted delivery claim is acquired by the caller. Uncertain sends are not retried automatically.
  await sendEmailOrThrow(staff)
  await sendEmailOrThrow(client)
}
