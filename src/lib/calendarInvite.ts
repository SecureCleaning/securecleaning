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

export function getCityTimeZone(city: BookingInputs['city']): string {
  return city === 'sydney' ? 'Australia/Sydney' : 'Australia/Melbourne'
}

/** Convert a local calendar date/time in an Australian city into a UTC Date. */
export function getDateTimeInTimeZone(dateString: string, timeString: string, timeZone: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)
  const utcGuess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0))

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    Number.isNaN(utcGuess.getTime())
  ) {
    return new Date(NaN)
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcGuess)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const displayedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )
  const offsetMs = displayedAsUtc - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offsetMs)
}

export function getBookingEventWindow(inputs: BookingInputs): { start: Date; end: Date } {
  const selectedStartTime = inputs.preferredInspectionStartTime
  const selectedEndTime = inputs.preferredInspectionEndTime

  if (selectedStartTime && selectedEndTime) {
    const timeZone = getCityTimeZone(inputs.city)
    const start = getDateTimeInTimeZone(inputs.preferredStartDate, selectedStartTime, timeZone)
    const end = getDateTimeInTimeZone(inputs.preferredStartDate, selectedEndTime, timeZone)

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end }
    }
  }

  const hour =
    inputs.timePreference === 'after_hours'
      ? 18
      : inputs.timePreference === 'weekend'
        ? 10
        : 9

  const start = getDateTimeInTimeZone(inputs.preferredStartDate, `${pad(hour)}:00`, getCityTimeZone(inputs.city))

  const end = new Date(start)
  end.setHours(start.getHours() + DEFAULT_EVENT_DURATION_HOURS)

  return { start, end }
}

export function buildBookingInviteIcs(bookingRef: string, inputs: BookingInputs): string {
  const { start, end } = getBookingEventWindow(inputs)
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const timeZone = getCityTimeZone(inputs.city)
  const summary = `Secure Cleaning inspection hold — ${inputs.businessName?.trim() || inputs.contactName?.trim() || 'Customer premises'}`
  const description = [
    `Booking reference: ${bookingRef}`,
    `Contact: ${inputs.contactName}`,
    `Email: ${inputs.email}`,
    `Phone: ${inputs.phone}`,
    `Address: ${inputs.address}, ${inputs.suburb} ${inputs.postcode}, ${cityLabel}`,
    `Frequency: ${inputs.frequency.replace(/_/g, ' ')}`,
    `Time preference: ${inputs.timePreference.replace(/_/g, ' ')}`,
    `Notes: ${inputs.notes?.trim() || 'None provided'}`,
    '',
    'This is a provisional inspection appointment selected within the published appointment window. Travel time between inspection appointments is reserved. Secure Cleaning will confirm the exact inspection time as soon as possible.',
  ].join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secure Cleaning//Booking Hold//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${bookingRef.toLowerCase()}@securecleaning.com.au`,
    `DTSTAMP:${toUtcIcsDate(new Date())}`,
    `DTSTART:${toUtcIcsDate(start)}`,
    `DTEND:${toUtcIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(`${inputs.address}, ${inputs.suburb} ${inputs.postcode}, ${cityLabel}`)}`,
    `STATUS:CONFIRMED`,
    `TRANSP:OPAQUE`,
    `X-WR-TIMEZONE:${timeZone || TIME_ZONE}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
