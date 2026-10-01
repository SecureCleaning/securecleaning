import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'

export const INDUCTION_REQUIRED_SALE_STATUSES = ['inspection_ready', 'inspection_scheduled'] as const

export function quoteRequiresFollowUp(quote: { status: string; followUpStatus?: string | null }) {
  return quote.status === 'sent' && !['won', 'lost'].includes(quote.followUpStatus ?? 'new')
}

export function saleRequiresInduction(status: string) {
  return INDUCTION_REQUIRED_SALE_STATUSES.includes(status as (typeof INDUCTION_REQUIRED_SALE_STATUSES)[number])
}

function dateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function buildDashboardWeek(events: AgentCalendarEvent[], now: Date, timeZone: string, weekOffset = 0) {
  const today = dateKey(now, timeZone)
  const start = new Date(`${today}T00:00:00Z`)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + weekOffset * 7 + index)
    const key = date.toISOString().slice(0, 10)
    return {
      key,
      label: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' }).format(date),
      dateLabel: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date),
      isToday: key === today,
      events: events.filter((event) => dateKey(new Date(event.startsAt), timeZone) === key),
    }
  })
}

export function parseDashboardWeekOffset(value: unknown) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0
  return Math.min(52, Number(value))
}
