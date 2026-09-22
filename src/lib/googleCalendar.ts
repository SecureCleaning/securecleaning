import { google } from 'googleapis'
import type { BookingInputs } from './types'
import { getBookingEventWindow, getCityTimeZone } from './calendarInvite'

function getCalendarClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  // NOTE:
  // For launch prep, this helper is structured for OAuth credentials.
  // To fully automate calendar writes in production, we will also need
  // a refresh token or service-account flow depending on the final setup.
  // For now this keeps the integration point clean and explicit.
  return new google.auth.OAuth2(clientId, clientSecret)
}

export async function createBookingFollowUpEvent(
  bookingRef: string,
  inputs: BookingInputs
): Promise<{ created: boolean; reason?: string }> {
  const auth = getCalendarClient()
  const calendarId =
    inputs.preferredInspectionCalendarId ||
    process.env.GOOGLE_CALENDAR_ID ||
    process.env.ADMIN_EMAIL

  if (!auth || !calendarId) {
    return { created: false, reason: 'Missing Google Calendar credentials or calendar id' }
  }

  // Refresh token not yet configured.
  // We intentionally no-op here until the OAuth consent flow is completed.
  if (!process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
    return { created: false, reason: 'Missing Google Calendar refresh token' }
  }

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  })

  const calendar = google.calendar({ version: 'v3', auth })

  const { start: startDate, end: endDate } = getBookingEventWindow(inputs)

  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const timeZone = getCityTimeZone(inputs.city)

  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Secure Cleaning site inspection — ${inputs.businessName?.trim() || inputs.contactName?.trim() || 'Customer premises'} (${bookingRef})`,
      description: [
        `Booking ref: ${bookingRef}`,
        `Contact: ${inputs.contactName}`,
        `Email: ${inputs.email}`,
        `Phone: ${inputs.phone}`,
        `Address: ${inputs.address}, ${inputs.suburb} ${inputs.postcode}`,
        `City: ${cityLabel}`,
        `Frequency: ${inputs.frequency}`,
        `Time preference: ${inputs.timePreference}`,
        `${inputs.inspectionBookingSource === 'crm_manual' ? 'Confirmed appointment' : 'Inspection window'}: ${inputs.preferredInspectionSlotLabel || 'Not selected'}`,
        `Assigned quoter: ${inputs.preferredInspectionAssigneeName || 'To be confirmed'}`,
        `Notes: ${inputs.notes || 'None'}`,
      ].join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone,
      },
    },
  })

  return { created: true }
}

export async function upsertContractSaleInspectionEvent(input: {
  inspectionId: string
  calendarId: string
  startsAt: Date
  durationMinutes: number
  timeZone: string
  summary: string
  description: string
  location: string
}): Promise<{ status: 'created' | 'updated' | 'failed'; eventId?: string; reason?: string }> {
  const auth = getCalendarClient()
  if (!auth || !input.calendarId.trim()) return { status: 'failed', reason: 'Missing Google Calendar credentials or staff calendar id' }
  if (!process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) return { status: 'failed', reason: 'Missing Google Calendar refresh token' }
  auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN })
  const calendar = google.calendar({ version: 'v3', auth })
  const eventId = `scinspection${input.inspectionId.replace(/[^a-f0-9]/gi, '').toLowerCase()}`
  const end = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000)
  const requestBody = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startsAt.toISOString(), timeZone: input.timeZone },
    end: { dateTime: end.toISOString(), timeZone: input.timeZone },
    transparency: 'opaque',
  }
  try {
    await calendar.events.update({ calendarId: input.calendarId, eventId, requestBody, sendUpdates: 'none' })
    return { status: 'updated', eventId }
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } })?.code
      ?? (error as { response?: { status?: number } })?.response?.status
    if (status !== 404) return { status: 'failed', eventId, reason: error instanceof Error ? error.message : 'Calendar update failed' }
  }
  try {
    await calendar.events.insert({ calendarId: input.calendarId, requestBody: { ...requestBody, id: eventId }, sendUpdates: 'none' })
    return { status: 'created', eventId }
  } catch (error) {
    return { status: 'failed', eventId, reason: error instanceof Error ? error.message : 'Calendar creation failed' }
  }
}
