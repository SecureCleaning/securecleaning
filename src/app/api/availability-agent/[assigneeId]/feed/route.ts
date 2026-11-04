import { escapeIcsText, serializeIcs } from '@/lib/ics'
import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getAgentCalendarEvents } from '@/lib/availabilityCalendar'
import { isValidAvailabilityAgentFeedToken } from '@/lib/availabilityAgentAuth'
import { rateLimit } from '@/lib/abuseProtection'
import { getCityTimeZone } from '@/lib/calendarInvite'
import { getAvailabilityCalendarFeedKey } from '@/lib/availabilityCalendarCredentials'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toUtcIcsDate(date: Date) {
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

function toLocalIcsDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}${values.month}${values.day}`
}


export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const blocked = await rateLimit(request, { key: 'availability-agent-feed:minute', limit: 30, windowMs: 60 * 1000 })
  if (blocked) return blocked

  const { assigneeId } = await context.params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  const feedKey = getAvailabilityCalendarFeedKey(assignee)
  if (!assignee || !feedKey) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  }

  const token = request.nextUrl.searchParams.get('token')
  if (!isValidAvailabilityAgentFeedToken(token, assigneeId, feedKey)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const events = (await getAgentCalendarEvents(config, assignee, { daysAhead: 60, includeAvailability: false }))
    .filter((event) => event.kind === 'booking' || event.kind === 'sale_inspection' || event.kind === 'blockout' || event.kind === 'public_holiday')
  const timeZone = getCityTimeZone(assignee.city)

  const body = serializeIcs([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secure Cleaning//Agent Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((event) => {
      const isBlockout = event.kind === 'blockout'
      const isPublicHoliday = event.kind === 'public_holiday'
      const dateLines = isPublicHoliday && event.allDay
        ? [
            `DTSTART;VALUE=DATE:${toLocalIcsDate(new Date(event.startsAt), timeZone)}`,
            `DTEND;VALUE=DATE:${toLocalIcsDate(new Date(event.endsAt), timeZone)}`,
          ]
        : [
            `DTSTART:${toUtcIcsDate(new Date(event.startsAt))}`,
            `DTEND:${toUtcIcsDate(new Date(event.endsAt))}`,
          ]
      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(`${event.id}@securecleaning.com.au`)}`,
        `DTSTAMP:${toUtcIcsDate(new Date())}`,
        ...dateLines,
        `SUMMARY:${escapeIcsText(isBlockout ? 'Unavailable' : event.title)}`,
        `DESCRIPTION:${escapeIcsText(isBlockout ? '' : event.description || event.subtitle || '')}`,
        `LOCATION:${escapeIcsText(isBlockout || isPublicHoliday ? '' : event.location || '')}`,
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ]
    }),
    'END:VCALENDAR',
  ])

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${assigneeId}-schedule.ics"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
