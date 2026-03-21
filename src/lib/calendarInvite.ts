import type { BookingInputs } from './types'

const TIME_ZONE = 'Australia/Melbourne'
const DEFAULT_EVENT_DURATION_HOURS = 1

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toUtcIcsDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('')
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

export function getBookingEventWindow(inputs: BookingInputs): { start: Date; end: Date } {
  const start = new Date(`${inputs.preferredStartDate}T09:00:00+11:00`)

  const hour =
    inputs.timePreference === 'after_hours'
      ? 18
      : inputs.timePreference === 'weekend'
        ? 10
        : 9

  start.setHours(hour, 0, 0, 0)

  const end = new Date(start)
  end.setHours(start.getHours() + DEFAULT_EVENT_DURATION_HOURS)

  return { start, end }
}

export function buildBookingInviteIcs(bookingRef: string, inputs: BookingInputs): string {
  const { start, end } = getBookingEventWindow(inputs)
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const summary = `Secure Cleaning Aus inspection hold — ${inputs.businessName}`
  const description = [
    `Booking reference: ${bookingRef}`,
    `Contact: ${inputs.contactName}`,
    `Email: ${inputs.email}`,
    `Phone: ${inputs.phone}`,
    `Address: ${inputs.address}, ${cityLabel}`,
    `Frequency: ${inputs.frequency.replace(/_/g, ' ')}`,
    `Time preference: ${inputs.timePreference.replace(/_/g, ' ')}`,
    `Notes: ${inputs.notes?.trim() || 'None provided'}`,
    '',
    'This hold represents your requested inspection / follow-up window. Secure Cleaning Aus will confirm the final appointment details directly.',
  ].join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secure Cleaning Aus//Booking Hold//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${bookingRef.toLowerCase()}@securecleaning.com.au`,
    `DTSTAMP:${toUtcIcsDate(new Date())}`,
    `DTSTART:${toUtcIcsDate(start)}`,
    `DTEND:${toUtcIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(`${inputs.address}, ${cityLabel}`)}`,
    `STATUS:CONFIRMED`,
    `TRANSP:OPAQUE`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
