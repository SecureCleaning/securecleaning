import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from './supabase'
import { partnerAvailability } from './partnerBookingAvailability'
import { partnerBookingDetails, checkPartnerDate, PartnerError } from './partnerBookingPolicy'
import type { PartnerActor } from './partnerBookingAuth'
import type { BookingInputs } from './types'
import { getCityTimeZone, getDateTimeInTimeZone } from './calendarInvite'
import { createBookingFollowUpEvent } from './googleCalendar'
import { sendBookingConfirmationEmail } from './email'

export async function createPartnerBooking(actor: PartnerActor, body: Record<string, unknown>) {
  const details = partnerBookingDetails(body), db = getAdminSupabase()
  const fingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex')
  const { data: replay, error: replayError } = await db.from('partner_booking_requests').select('id, input_hash, booking_id, email_status, calendar_status').eq('id', details.idempotencyKey).eq('user_id', actor.id).maybeSingle()
  if (replayError) throw replayError
  if (replay) {
    if (replay.input_hash !== fingerprint) throw new PartnerError('This request was already used. Start a new booking.', 409)
    const { data: saved, error } = await db.from('bookings').select('booking_ref').eq('id', replay.booking_id).single()
    if (error) throw error
    return { bookingRef: saved.booking_ref, emailStatus: replay.email_status, calendarStatus: replay.calendar_status, replay: true }
  }
  checkPartnerDate(details.date, details.city)
  const available = await partnerAvailability(actor.company, details)
  const slot = available.suggestions.find(s => s.slotId === details.slotId)
  if (!slot) throw new PartnerError('That time is no longer available. Refresh and select another appointment.', 409)
  const start = getDateTimeInTimeZone(details.date, slot.startTime, getCityTimeZone(details.city))
  const end = getDateTimeInTimeZone(details.date, slot.endTime, getCityTimeZone(details.city))
  const inputs: BookingInputs = {
    businessName: details.businessName, contactName: details.contactName, email: details.email, phone: details.phone,
    address: details.address, suburb: details.suburb, postcode: details.postcode, city: details.city,
    premisesType: details.premisesType as BookingInputs['premisesType'], frequency: details.frequency as BookingInputs['frequency'], timePreference: details.timePreference as BookingInputs['timePreference'],
    notes: details.notes, preferredStartDate: details.date, inspectionBookingSource: 'partner', inspectionAvailabilityOverridden: false,
    inspectionDurationMinutes: (end.getTime() - start.getTime()) / 60000,
    preferredInspectionSlotId: slot.slotId, preferredInspectionSlotLabel: slot.label, preferredInspectionDay: slot.day,
    preferredInspectionStartTime: slot.startTime, preferredInspectionEndTime: slot.endTime,
    preferredInspectionAssigneeId: slot.assigneeId, preferredInspectionAssigneeName: slot.assigneeName, preferredInspectionCalendarId: slot.calendarId,
    addOns: { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false },
  }
  const { data: saved, error } = await db.rpc('create_partner_booking', { p_user_id: actor.id, p_session_version: actor.session_version, p_request_id: details.idempotencyKey, p_input_hash: fingerprint, p_inputs: inputs, p_start: start.toISOString(), p_config: available.content })
  if (error) {
    if (error.code === '23P01') throw new PartnerError('Availability has changed. Refresh and select another appointment.', 409)
    if (error.code === '42501') throw new PartnerError('Your booking permissions have changed. Please sign in again.', 403)
    if (['23505','23514'].includes(error.code)) throw new PartnerError('This booking needs a Secure Cleaning team review. Please contact us before trying again.', 409)
    throw error
  }
  // Only the transaction that created the booking may dispatch side effects.
  // Mark sending before network calls; uncertain outcomes are reviewed, never blindly retried.
  let emailStatus = 'queued', calendarStatus = 'queued'
  if (saved.created) {
    const { data: claim, error: claimError } = await db.from('partner_booking_requests').update({ email_status: 'sending', calendar_status: 'sending' }).eq('id', details.idempotencyKey).eq('email_status', 'queued').select('id').maybeSingle()
    if (!claimError && claim) {
      try { await sendBookingConfirmationEmail(saved.bookingRef, inputs); emailStatus = 'sent' } catch { emailStatus = 'review_required' }
      const googleConfigured = Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_REFRESH_TOKEN)
      // An internal calendar needs no Google write. Never fall back to another calendar.
      if (!googleConfigured || !slot.calendarId) calendarStatus = 'internal'
      else {
        try { const result = await createBookingFollowUpEvent(saved.bookingRef, inputs); calendarStatus = result.created ? 'sent' : 'review_required' } catch { calendarStatus = 'review_required' }
      }
      const { error: updateError } = await db.from('partner_booking_requests').update({ email_status: emailStatus, calendar_status: calendarStatus }).eq('id', details.idempotencyKey)
      if (updateError) { emailStatus = 'review_required'; calendarStatus = 'review_required' }
    }
  }
  return { bookingRef: saved.bookingRef, emailStatus, calendarStatus, replay: !saved.created }
}
