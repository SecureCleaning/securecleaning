import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getAgentCalendarEvents } from '@/lib/availabilityCalendar'
import { isValidAvailabilityAgentFeedToken } from '@/lib/availabilityAgentAuth'
import { rateLimit } from '@/lib/abuseProtection'

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

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const blocked = rateLimit(request, { key: 'availability-agent-feed:minute', limit: 30, windowMs: 60 * 1000 })
  if (blocked) return blocked

  const { assigneeId } = await context.params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  if (!assignee?.active || !assignee.accessCodeHash) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  }

  const token = request.nextUrl.searchParams.get('token')
  if (!isValidAvailabilityAgentFeedToken(token, assigneeId, assignee.accessCodeHash)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const events = (await getAgentCalendarEvents(config, assignee, { daysAhead: 60, includeAvailability: false }))
    .filter((event) => event.kind === 'booking')

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secure Cleaning Aus//Agent Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`${event.id}@securecleaning.com.au`)}`,
      `DTSTAMP:${toUtcIcsDate(new Date())}`,
      `DTSTART:${toUtcIcsDate(new Date(event.startsAt))}`,
      `DTEND:${toUtcIcsDate(new Date(event.endsAt))}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description || event.subtitle || '')}`,
      `LOCATION:${escapeIcsText(event.location || '')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${assigneeId}-schedule.ics"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
