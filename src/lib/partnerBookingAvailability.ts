import 'server-only'
import { google } from 'googleapis'
import { getCalendarClient } from './googleCalendar'
import { getAdminSupabase } from './supabase'
import { mergeAvailabilityConfig, matchServiceZones, getAvailabilitySuggestionsForConfig, type AvailabilityConfig } from './availability'
import { getCityTimeZone, getDateTimeInTimeZone } from './calendarInvite'
import { addDays, localDate, partnerConfig, partnerLocation, safePartnerSlot, PartnerError, type PartnerCompany } from './partnerBookingPolicy'
import { isPartnerWeekday, partnerCalendarWeek } from './partnerBookingDates'
import type { City } from './types'
import { proposalAgent } from './partnerAppointmentPolicy'

export type PartnerBusy = { assigneeId: string; start: Date; end: Date }
export async function loadPartnerConfig() {
  const { data, error } = await getAdminSupabase().from('availability_private_config').select('content').eq('key', 'availability.config').single()
  if (error || !data?.content) throw new PartnerError('Calendar configuration is unavailable. Please contact Secure Cleaning.', 503)
  const raw = JSON.parse(data.content)
  if (!Array.isArray(raw.assignees) || !Array.isArray(raw.weeklySlots) || !Array.isArray(raw.oneOffBlocks)) throw new PartnerError('Calendar configuration is incomplete.', 503)
  return { config: mergeAvailabilityConfig(raw), content: data.content as string }
}
export async function loadPartnerBusy(config: AvailabilityConfig, city: City, from: string, until: string): Promise<PartnerBusy[]> {
  const db = getAdminSupabase(), zone = getCityTimeZone(city)
  const start = getDateTimeInTimeZone(addDays(from, -1), '00:00', zone).toISOString()
  const end = getDateTimeInTimeZone(addDays(until, 2), '00:00', zone).toISOString()
  const [bookings, inspections, staff] = await Promise.all([
    db.from('bookings').select('id, inputs, status, inspection_status, inspection_scheduled_for').gte('inspection_scheduled_for', start).lt('inspection_scheduled_for', end).limit(1001),
    db.from('contract_sale_inspections').select('starts_at, duration_minutes, scheduled_by_staff_id, status').gte('starts_at', start).lt('starts_at', end).in('status', ['scheduled', 'completed']).limit(1001),
    db.from('admin_staff_accounts').select('id, availability_assignee_id').in('availability_assignee_id', config.assignees.map(a => a.id)),
  ])
  if (bookings.error || inspections.error || staff.error || (bookings.data?.length ?? 0) > 1000 || (inspections.data?.length ?? 0) > 1000) throw new PartnerError('Availability could not be checked. Please try again shortly.', 503)
  const busy: PartnerBusy[] = []
  for (const row of bookings.data ?? []) {
    if (row.status === 'cancelled' || row.inspection_status === 'cancelled') continue
    const start = new Date(row.inspection_scheduled_for)
    const inputs = row.inputs ?? {}
    let duration = Number(inputs.inspectionDurationMinutes) || 10
    if (!inputs.inspectionDurationMinutes && inputs.preferredInspectionStartTime && inputs.preferredInspectionEndTime) {
      const mins = (s: string) => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1])
      duration = Math.max(10, mins(inputs.preferredInspectionEndTime) - mins(inputs.preferredInspectionStartTime))
    }
    busy.push({ assigneeId: inputs.preferredInspectionAssigneeId || '', start, end: new Date(start.getTime() + duration * 60000) })
  }
  const staffMap = new Map((staff.data ?? []).map(s => [s.id, s.availability_assignee_id]))
  for (const row of inspections.data ?? []) {
    const assigneeId = staffMap.get(row.scheduled_by_staff_id)
    if (!assigneeId) continue
    const start = new Date(row.starts_at)
    busy.push({ assigneeId, start, end: new Date(start.getTime() + row.duration_minutes * 60000) })
  }
  const googleConfigured = ['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_REFRESH_TOKEN'].some(k => Boolean(process.env[k]))
  const calendars = config.assignees.filter(a => a.calendarId?.trim())
  if (googleConfigured && calendars.length) {
    const auth = getCalendarClient()
    if (!auth || !process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) throw new PartnerError('Connected calendars cannot be checked. Please contact Secure Cleaning.', 503)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    // Free/busy only: never request provider event names, contacts or descriptions.
    for (let offset = 0; offset < calendars.length; offset += 50) {
      const batch = calendars.slice(offset, offset + 50)
      const result = await calendar.freebusy.query({ requestBody: { timeMin: start, timeMax: end, items: batch.map(a => ({ id: a.calendarId! })) } })
      for (const agent of batch) {
        const value = result.data.calendars?.[agent.calendarId!]
        if (!value || value.errors?.length) throw new PartnerError('A connected calendar cannot be checked. Please contact Secure Cleaning.', 503)
        for (const item of value.busy ?? []) if (item.start && item.end) busy.push({ assigneeId: agent.id, start: new Date(item.start), end: new Date(item.end) })
      }
    }
  }
  return busy
}
export async function partnerAvailability(company: PartnerCompany, input: Record<string, unknown>) {
  const location = partnerLocation(input), today = localDate(location.city)
  const firstDate = addDays(today, 1)
  const anchor = typeof input.date === 'string' && input.date ? input.date : firstDate
  const horizon = addDays(today, 90)
  let week: ReturnType<typeof partnerCalendarWeek>
  try { week = partnerCalendarWeek(anchor, firstDate, horizon) } catch { throw new PartnerError('Choose a week within the next 90 days.') }
  const source = await loadPartnerConfig()
  const config = partnerConfig(source.config, company, location.city)
  config.settings = { ...config.settings, maxSlotsToShow: 500, melbourneMaxSlotsToShow: 500 }
  const zones = matchServiceZones(location, location.city, config.zones).zones
  const busy = config.assignees.length && zones.length ? await loadPartnerBusy(config, location.city, today, horizon) : []
  const now = Date.now()
  const suggestions = (date: string, includeBusy: boolean) => !isPartnerWeekday(date) || date < firstDate || date > horizon ? [] : getAvailabilitySuggestionsForConfig(includeBusy ? config : { ...config, oneOffBlocks: [] }, zones, location.city, date, includeBusy ? busy : [])
    .filter(s => getDateTimeInTimeZone(date, s.startTime, getCityTimeZone(location.city)).getTime() > now)
  let next: ReturnType<typeof safePartnerSlot> | null = null
  for (let date = firstDate; date <= horizon; date = addDays(date, 1)) { const first = suggestions(date, true)[0]; if (first) { next = safePartnerSlot(first, date); break } }
  if (!input.date && next) week = partnerCalendarWeek(next.date, firstDate, horizon)
  const days = week.dates.map(date => {
    const available = suggestions(date, true)
    const availableTimes = new Set(available.map(s => s.startTime))
    // Generic unavailable slots; never expose why a time or area is blocked.
    const unavailable = [...new Map(suggestions(date, false).filter(s => !availableTimes.has(s.startTime)).map(s => [s.startTime, { startTime: s.startTime, endTime: s.endTime }])).values()]
    return { date, slots: available.map(s => safePartnerSlot(s, date)), unavailable }
  })
  return { public: { days, next, requestAgent: proposalAgent(source.config, company, input)?.name ?? null, weekStart: week.weekStart, previousWeek: week.previousWeek, nextWeek: week.nextWeek, minDate: firstDate, maxDate: horizon, timeZone: getCityTimeZone(location.city), calendars: config.assignees.map(a => ({ name: a.name })), zoneMatched: zones.length > 0 },
    config, content: source.content, location, suggestions: suggestions(anchor, true) }
}
