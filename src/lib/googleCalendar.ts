import { google } from 'googleapis'
import type { BookingInputs } from './types'

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
  const calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.ADMIN_EMAIL

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

  const startDate = new Date(inputs.preferredStartDate)
  const startHour = inputs.timePreference === 'after_hours' ? 18 : inputs.timePreference === 'weekend' ? 10 : 9
  startDate.setHours(startHour, 0, 0, 0)

  const endDate = new Date(startDate)
  endDate.setHours(startDate.getHours() + 1)

  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'

  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Secure Cleaning Aus follow-up — ${inputs.businessName} (${bookingRef})`,
      description: [
        `Booking ref: ${bookingRef}`,
        `Contact: ${inputs.contactName}`,
        `Email: ${inputs.email}`,
        `Phone: ${inputs.phone}`,
        `Address: ${inputs.address}`,
        `City: ${cityLabel}`,
        `Frequency: ${inputs.frequency}`,
        `Time preference: ${inputs.timePreference}`,
        `Notes: ${inputs.notes || 'None'}`,
      ].join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'Australia/Melbourne',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Australia/Melbourne',
      },
    },
  })

  return { created: true }
}
