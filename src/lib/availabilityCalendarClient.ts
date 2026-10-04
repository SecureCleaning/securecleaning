import type { OneOffAvailabilityBlock } from '@/lib/availability'
import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'

export function replaceCalendarBlockoutEvents(
  events: AgentCalendarEvent[],
  blocks: OneOffAvailabilityBlock[],
) {
  const blockoutEvents = blocks.flatMap((block): AgentCalendarEvent[] => {
    if (!block.active || !block.startsAt || !block.endsAt) return []
    const startsAt = new Date(block.startsAt)
    const endsAt = new Date(block.endsAt)
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) return []

    return [{
      id: `blockout-${block.id}`,
      kind: 'blockout',
      title: block.label || 'Unavailable',
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      description: 'Manual block-out added by the agent or admin.',
    }]
  })

  return [
    ...events.filter((event) => event.kind !== 'blockout'),
    ...blockoutEvents,
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
}

export function calendarDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function calendarFortnight(now: Date, timeZone: string, offset: number) {
  // UTC dates represent calendar labels, not appointment instants. This keeps
  // day arithmetic stable across host timezones and daylight-saving changes.
  const start = new Date(`${calendarDateKey(now, timeZone)}T00:00:00Z`)
  const weekday = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday) + offset * 14)
  return Array.from({ length: 2 }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + week * 7 + day)
    return date
  }))
}
