import { getBookingEventWindow, getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import { getAdminSupabase } from '@/lib/supabase'
import type { BookingInputs } from '@/lib/types'
import type {
  AvailabilityConfig,
  AvailabilityAssignee,
  OneOffAvailabilityBlock,
  ServiceZone,
  WeeklyAvailabilitySlot,
  Weekday,
} from '@/lib/availability'
import { getAssigneeServiceZones } from '@/lib/availability'
import { bookingBelongsToAvailabilityAssignee } from '@/lib/availabilityLinkage'

export type AgentCalendarEvent = {
  id: string
  kind: 'booking' | 'availability' | 'blockout'
  bookingRef?: string
  title: string
  startsAt: string
  endsAt: string
  subtitle?: string
  description?: string
  location?: string
  details?: Array<{ label: string; value: string }>
}

type BookingCalendarRow = {
  booking_ref: string
  status: string
  assigned_operator_id?: string | null
  created_at?: string | null
  inputs?: BookingInputs
}

const DAY_INDEX: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
}

function startOfCalendarDay(value: Date) {
  const next = new Date(value)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

function addCalendarDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toIso(value: Date) {
  return value.toISOString()
}

function dateStringInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function localDateTimeToIso(date: Date, time: string, timeZone: string) {
  const dateString = [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-')
  return getDateTimeInTimeZone(dateString, time, timeZone).toISOString()
}

function formatZoneNames(zoneIds: string[], zones: ServiceZone[]) {
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone.name]))
  return zoneIds
    .map((zoneId) => zoneMap.get(zoneId))
    .filter(Boolean)
    .join(', ')
}

function getNextDateForWeekday(rangeStart: Date, weekday: Weekday) {
  const targetDay = DAY_INDEX[weekday]
  const current = startOfCalendarDay(rangeStart)
  const diff = (targetDay - current.getUTCDay() + 7) % 7
  return addCalendarDays(current, diff)
}

function buildAvailabilityEvents(
  slots: WeeklyAvailabilitySlot[],
  zones: ServiceZone[],
  city: AvailabilityAssignee['city'],
  rangeStart: Date,
  rangeEnd: Date
): AgentCalendarEvent[] {
  const events: AgentCalendarEvent[] = []
  const timeZone = getCityTimeZone(city)

  for (const slot of slots) {
    let occurrence = getNextDateForWeekday(rangeStart, slot.day)

    while (occurrence <= rangeEnd) {
      const startsAt = localDateTimeToIso(occurrence, slot.startTime, timeZone)
      const endsAt = localDateTimeToIso(occurrence, slot.endTime, timeZone)

      events.push({
        id: `availability-${slot.id}-${startsAt}`,
        kind: 'availability',
        title: slot.label || 'Available inspection window',
        startsAt,
        endsAt,
        subtitle: formatZoneNames(slot.zoneIds, zones) || 'No zones assigned',
        description: slot.notes || 'Recurring inspection availability window.',
      })

      occurrence = addCalendarDays(occurrence, 7)
    }
  }

  return events
}

function buildBlockEvents(
  blocks: OneOffAvailabilityBlock[],
  rangeStart: Date,
  rangeEnd: Date
): AgentCalendarEvent[] {
  return blocks
    .filter((block) => {
      if (!block.active || !block.startsAt || !block.endsAt) return false
      const startsAt = new Date(block.startsAt)
      const endsAt = new Date(block.endsAt)
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return false
      return endsAt >= rangeStart && startsAt <= rangeEnd
    })
    .map((block) => ({
      id: `blockout-${block.id}`,
      kind: 'blockout',
      title: block.label || 'Unavailable',
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      description: 'Manual block-out added by the agent or admin.',
    }))
}

function buildBookingEvents(
  bookings: BookingCalendarRow[],
  rangeStart: Date,
  rangeEnd: Date
): AgentCalendarEvent[] {
  return bookings
    .map((booking) => {
      const inputs = booking.inputs
      if (!inputs?.preferredStartDate) return null

      const { start, end } = getBookingEventWindow(inputs)
      if (end < rangeStart || start > rangeEnd) return null
      const location = [inputs.address, inputs.suburb, inputs.postcode].filter(Boolean).join(', ')
      const details = [
        inputs.suburb ? { label: 'Suburb', value: inputs.suburb } : null,
        inputs.businessName ? { label: 'Company', value: inputs.businessName } : null,
        inputs.contactName ? { label: 'Contact', value: inputs.contactName } : null,
        location ? { label: 'Address', value: location } : null,
        inputs.email ? { label: 'Email', value: inputs.email } : null,
        inputs.phone ? { label: 'Phone', value: inputs.phone } : null,
        inputs.notes ? { label: 'Notes', value: inputs.notes } : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>

      return {
        id: `booking-${booking.booking_ref}`,
        kind: 'booking' as const,
        bookingRef: booking.booking_ref,
        title: inputs.suburb || inputs.businessName || 'Inspection appointment',
        startsAt: toIso(start),
        endsAt: toIso(end),
        subtitle: booking.status.replace(/_/g, ' '),
        description: details.map((item) => `${item.label}: ${item.value}`).join('\n'),
        location,
        details,
      }
    })
    .filter(Boolean) as AgentCalendarEvent[]
}

export async function getAgentBookingsForCalendar(config: AvailabilityConfig, assignee: AvailabilityAssignee) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('bookings')
    .select('booking_ref, status, created_at, inputs, assigned_operator_id')
    .in('status', ['pending', 'confirmed', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[availabilityCalendar] bookings load failed:', error)
    return []
  }

  const serviceZones = getAssigneeServiceZones(config, assignee.id)
  return (data ?? []).filter((booking) => (
    bookingBelongsToAvailabilityAssignee(booking, assignee, serviceZones)
  )) as BookingCalendarRow[]
}

export async function getAgentCalendarEvents(
  config: AvailabilityConfig,
  assignee: AvailabilityAssignee,
  options?: { daysBehind?: number; daysAhead?: number; includeAvailability?: boolean }
) {
  const daysBehind = options?.daysBehind ?? 42
  const daysAhead = options?.daysAhead ?? 28
  const includeAvailability = options?.includeAvailability ?? true
  const range = getAgentCalendarDateRange(new Date(), assignee.city, daysBehind, daysAhead)
  const weeklySlots = config.weeklySlots.filter((slot) => slot.assigneeId === assignee.id && slot.active)
  const oneOffBlocks = config.oneOffBlocks.filter((block) => block.assigneeId === assignee.id && block.active)
  const zones = config.zones.filter((zone) => zone.city === assignee.city)
  const bookings = await getAgentBookingsForCalendar(config, assignee)

  const events = [
    ...buildBookingEvents(bookings, range.start, range.end),
    ...buildBlockEvents(oneOffBlocks, range.start, range.end),
    ...(includeAvailability ? buildAvailabilityEvents(weeklySlots, zones, assignee.city, range.calendarStart, range.calendarEnd) : []),
  ]

  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export function getAgentCalendarDateRange(
  now: Date,
  city: AvailabilityAssignee['city'],
  daysBehind: number,
  daysAhead: number,
) {
  const timeZone = getCityTimeZone(city)
  const today = dateStringInTimeZone(now, timeZone)
  const todayAsCalendarDate = new Date(`${today}T00:00:00Z`)
  const calendarStart = addCalendarDays(todayAsCalendarDate, -Math.max(0, daysBehind))
  const calendarEnd = addCalendarDays(todayAsCalendarDate, Math.max(0, daysAhead))
  const startDate = calendarStart.toISOString().slice(0, 10)
  const endExclusiveDate = addCalendarDays(calendarEnd, 1).toISOString().slice(0, 10)

  return {
    start: getDateTimeInTimeZone(startDate, '00:00', timeZone),
    end: getDateTimeInTimeZone(endExclusiveDate, '00:00', timeZone),
    calendarStart,
    calendarEnd,
  }
}
