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
