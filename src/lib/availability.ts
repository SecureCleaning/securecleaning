import { getAdminSupabase } from '@/lib/supabase'
import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import type { City } from '@/lib/types'

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type ServiceZone = {
  id: string
  name: string
  city: City
  matchTerms: string[]
  postcodes: string[]
  notes?: string
}

export type WeeklyAvailabilitySlot = {
  id: string
  city: City
  assigneeId: string
  label: string
  day: Weekday
  startTime: string
  endTime: string
  zoneIds: string[]
  active: boolean
  notes?: string
}

export type AvailabilityAssignee = {
  id: string
  name: string
  username?: string
  city: City
  email?: string
  calendarId?: string
  calendarViewUrl?: string
  calendarSubscriptionUrl?: string
  accessCodeHash?: string
  active: boolean
  notes?: string
}

export type OneOffAvailabilityBlock = {
  id: string
  assigneeId: string
  startsAt: string
  endsAt: string
  label: string
  active: boolean
}

export type AvailabilityConfig = {
  settings: {
    maxSlotsToShow: number
  }
  zones: ServiceZone[]
  assignees: AvailabilityAssignee[]
  weeklySlots: WeeklyAvailabilitySlot[]
  oneOffBlocks: OneOffAvailabilityBlock[]
}

export type AvailabilitySuggestion = {
  slotId: string
  label: string
  windowLabel?: string
  day: Weekday
  startTime: string
  endTime: string
  zoneNames: string[]
  assigneeId: string
  assigneeName: string
  calendarId?: string
}

export type AvailabilityCalendarResult = {
  zoneMatched: boolean
  matchedZoneNames: string[]
  suggestions: AvailabilitySuggestion[]
  availableDates: string[]
  nextAvailableDate?: string
  nextAvailableSuggestions?: AvailabilitySuggestion[]
}

const AVAILABILITY_CONTENT_KEY = 'availability.config'
const AVAILABILITY_CONTENT_TITLE = 'Booking availability configuration'

const DAY_ORDER: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

// Inspections are short visits. The remaining time in each hourly start slot
// is reserved for travel to the next appointment.
const INSPECTION_DURATION_MINUTES = 10
const INSPECTION_BUFFER_MINUTES = 50

export const DEFAULT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  settings: {
    maxSlotsToShow: 6,
  },
  assignees: [
    {
      id: 'melb_primary',
      name: 'Melbourne Quoter',
      city: 'melbourne',
      email: '',
      calendarId: '',
      active: true,
      notes: 'Primary inspection calendar for Melbourne.',
    },
  ],
  zones: [
    {
      id: 'melb_south_east_east',
      name: 'Southern Eastern + Eastern Suburbs',
      city: 'melbourne',
      matchTerms: [
        'brighton', 'bentleigh', 'cheltenham', 'mentone', 'mordialloc', 'moorabbin',
        'elsternwick', 'elwood', 'st kilda', 'south yarra', 'prahran', 'toorak',
        'malvern', 'armadale', 'caulfield', 'carnegie', 'oakleigh', 'clayton',
        'mulgrave', 'wheelers hill', 'mount waverley', 'glen waverley', 'camberwell',
        'hawthorn', 'kew', 'balwyn', 'box hill', 'blackburn', 'nunawading', 'doncaster',
        'templestowe', 'ringwood', 'croydon', 'vermont', 'burwood', 'surrey hills'
      ],
      postcodes: ['3004', '3121', '3122', '3123', '3124', '3141', '3142', '3143', '3144', '3145', '3161', '3162', '3163', '3165', '3181', '3182', '3183', '3184', '3186', '3192', '3194', '3204'],
      notes: 'Default zone for Monday inspection runs.',
    },
    {
      id: 'melb_south_east',
      name: 'South East Melbourne',
      city: 'melbourne',
      matchTerms: [
        'south yarra', 'prahran', 'toorak', 'malvern', 'armadale', 'caulfield', 'carnegie',
        'oakleigh', 'clayton', 'mulgrave', 'springvale', 'dandenong', 'noble park',
        'keysborough', 'mentone', 'cheltenham', 'moorabbin', 'bentleigh', 'mordialloc',
        'brighton', 'glen waverley', 'mount waverley', 'wheelers hill', 'berwick', 'narre warren'
      ],
      postcodes: ['3141', '3142', '3143', '3144', '3145', '3161', '3162', '3163', '3165', '3170', '3171', '3172', '3173', '3174', '3175', '3177', '3178', '3186', '3192', '3194', '3204'],
      notes: 'Primary Wednesday and Friday inspection zone.',
    },
    {
      id: 'melb_inner_city',
      name: 'Melbourne Inner City',
      city: 'melbourne',
      matchTerms: [
        'melbourne', 'east melbourne', 'west melbourne', 'north melbourne', 'southbank',
        'south wharf', 'docklands', 'carlton', 'carlton north', 'fitzroy', 'collingwood',
        'richmond', 'abbotsford', 'flemington', 'parkville'
      ],
      postcodes: ['3000', '3002', '3003', '3005', '3006', '3008', '3051', '3052', '3065', '3066', '3121'],
      notes: 'Added to Wednesday run alongside South East Melbourne.',
    },
    {
      id: 'melb_north_west',
      name: 'Northern + Western Melbourne Suburbs',
      city: 'melbourne',
      matchTerms: [
        'north melbourne', 'flemington', 'kensington', 'footscray', 'footscray west',
        'yarraville', 'spotswood', 'altona', 'altona north', 'sunshine', 'sunshine west',
        'braybrook', 'maidstone', 'maribyrnong', 'essendon', 'moonee ponds', 'ascot vale',
        'brunswick', 'brunswick east', 'brunswick west', 'coburg', 'pascoe vale', 'glenroy',
        'airport west', 'keilor', 'keilor east', 'keilor park', 'taylors lakes', 'sydenham',
        'caroline springs', 'deer park', 'point cook', 'laverton', 'hoppers crossing',
        'werribee', 'tarneit', 'truganina', 'melton'
      ],
      postcodes: ['3003', '3011', '3012', '3013', '3015', '3016', '3018', '3019', '3020', '3021', '3023', '3024', '3025', '3026', '3027', '3029', '3030', '3032', '3039', '3040', '3042', '3044', '3046', '3055', '3056'],
      notes: 'Default Tuesday and Thursday run.',
    },
    {
      id: 'melb_geelong',
      name: 'Geelong Region',
      city: 'melbourne',
      matchTerms: [
        'geelong', 'south geelong', 'north geelong', 'geelong west', 'newtown', 'belmont',
        'highton', 'grovedale', 'waurn ponds', 'armstrong creek', 'marshall', 'breakwater',
        'lara', 'corio', 'norlane', 'bell park', 'bell post hill', 'belmont', 'torquay'
      ],
      postcodes: ['3214', '3215', '3216', '3217', '3218', '3219', '3220', '3221', '3222', '3228'],
      notes: 'Included on Thursday with north/west suburbs.',
    },
  ],
  weeklySlots: [
    {
      id: 'melb_mon_12_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Monday 12:00pm–3:00pm',
      day: 'monday',
      startTime: '12:00',
      endTime: '15:00',
      zoneIds: ['melb_south_east_east'],
      active: true,
      notes: 'Southern eastern and eastern suburbs Melbourne',
    },
    {
      id: 'melb_tue_10_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Tuesday 10:00am–3:00pm',
      day: 'tuesday',
      startTime: '10:00',
      endTime: '15:00',
      zoneIds: ['melb_north_west'],
      active: true,
      notes: 'North and west Melbourne suburbs',
    },
    {
      id: 'melb_wed_10_2',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Wednesday 10:00am–2:00pm',
      day: 'wednesday',
      startTime: '10:00',
      endTime: '14:00',
      zoneIds: ['melb_south_east', 'melb_inner_city'],
      active: true,
      notes: 'South East Melbourne and inner city',
    },
    {
      id: 'melb_thu_10_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Thursday 10:00am–3:00pm',
      day: 'thursday',
      startTime: '10:00',
      endTime: '15:00',
      zoneIds: ['melb_north_west', 'melb_geelong'],
      active: true,
      notes: 'North/west Melbourne plus Geelong region',
    },
    {
      id: 'melb_fri_10_12',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Friday 10:00am–12:00pm',
      day: 'friday',
      startTime: '10:00',
      endTime: '12:00',
      zoneIds: ['melb_south_east'],
      active: true,
      notes: 'South East Melbourne',
    },
  ],
  oneOffBlocks: [],
}

function cloneDefaultConfig(): AvailabilityConfig {
  return JSON.parse(JSON.stringify(DEFAULT_AVAILABILITY_CONFIG)) as AvailabilityConfig
}

function sanitizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function mergeConfig(candidate: unknown): AvailabilityConfig {
  const fallback = cloneDefaultConfig()

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const source = candidate as Partial<AvailabilityConfig>

  return {
    settings: {
      maxSlotsToShow: Number(source.settings?.maxSlotsToShow ?? fallback.settings.maxSlotsToShow),
    },
    zones: Array.isArray(source.zones)
      ? source.zones.map((zone, index) => ({
          id: String(zone?.id ?? `zone-${index + 1}`),
          name: String(zone?.name ?? `Zone ${index + 1}`),
          city: zone?.city === 'sydney' ? 'sydney' : 'melbourne',
          matchTerms: sanitizeList(zone?.matchTerms),
          postcodes: sanitizeList(zone?.postcodes),
          notes: typeof zone?.notes === 'string' ? zone.notes : '',
        }))
      : fallback.zones,
    assignees: Array.isArray(source.assignees)
      ? source.assignees.map((assignee, index) => ({
          id: String(assignee?.id ?? `assignee-${index + 1}`),
          name: String(assignee?.name ?? `Assignee ${index + 1}`),
          username: typeof assignee?.username === 'string' ? assignee.username : '',
          city: assignee?.city === 'sydney' ? 'sydney' : 'melbourne',
          email: typeof assignee?.email === 'string' ? assignee.email : '',
          calendarId: typeof assignee?.calendarId === 'string' ? assignee.calendarId : '',
          calendarViewUrl: typeof assignee?.calendarViewUrl === 'string' ? assignee.calendarViewUrl : '',
          calendarSubscriptionUrl:
            typeof assignee?.calendarSubscriptionUrl === 'string' ? assignee.calendarSubscriptionUrl : '',
          accessCodeHash: typeof assignee?.accessCodeHash === 'string' ? assignee.accessCodeHash : '',
          active: Boolean(assignee?.active ?? true),
          notes: typeof assignee?.notes === 'string' ? assignee.notes : '',
        }))
      : fallback.assignees,
    weeklySlots: Array.isArray(source.weeklySlots)
      ? source.weeklySlots.map((slot, index) => ({
          id: String(slot?.id ?? `slot-${index + 1}`),
          city: slot?.city === 'sydney' ? 'sydney' : 'melbourne',
          assigneeId:
            typeof slot?.assigneeId === 'string' && slot.assigneeId
              ? slot.assigneeId
              : (fallback.assignees.find((assignee) => assignee.city === (slot?.city === 'sydney' ? 'sydney' : 'melbourne'))?.id ?? fallback.assignees[0]?.id ?? ''),
          label: String(slot?.label ?? `Slot ${index + 1}`),
          day: DAY_ORDER.includes(String(slot?.day) as Weekday)
            ? (String(slot?.day) as Weekday)
            : 'monday',
          startTime: String(slot?.startTime ?? '09:00'),
          endTime: String(slot?.endTime ?? '10:00'),
          zoneIds: sanitizeList(slot?.zoneIds),
          active: Boolean(slot?.active ?? true),
          notes: typeof slot?.notes === 'string' ? slot.notes : '',
        }))
      : fallback.weeklySlots,
    oneOffBlocks: Array.isArray(source.oneOffBlocks)
      ? source.oneOffBlocks.map((block, index) => ({
          id: String(block?.id ?? `block-${index + 1}`),
          assigneeId: String(block?.assigneeId ?? ''),
          startsAt: String(block?.startsAt ?? ''),
          endsAt: String(block?.endsAt ?? ''),
          label: String(block?.label ?? `Unavailable block ${index + 1}`),
          active: Boolean(block?.active ?? true),
        }))
      : fallback.oneOffBlocks,
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractPostcode(address: string): string | null {
  const match = address.match(/\b(\d{4})\b/)
  return match?.[1] ?? null
}

export function findMatchingZones(searchText: string, city: City, config: AvailabilityConfig): ServiceZone[] {
  const normalizedAddress = normalizeText(searchText)
  const postcode = extractPostcode(searchText)

  return config.zones.filter((zone) => {
    if (zone.city !== city) return false

    const termMatch = zone.matchTerms.some((term) => {
      const normalizedTerm = normalizeText(term)
      return normalizedTerm.length > 0 && normalizedAddress.includes(normalizedTerm)
    })

    const postcodeMatch = Boolean(postcode && zone.postcodes.includes(postcode))

    return termMatch || postcodeMatch
  })
}

export function getAssigneeServiceZones(config: AvailabilityConfig, assigneeId: string) {
  const zoneIds = new Set(
    config.weeklySlots
      .filter((slot) => slot.assigneeId === assigneeId && slot.active)
      .flatMap((slot) => slot.zoneIds),
  )

  return config.zones.filter((zone) => zoneIds.has(zone.id))
}

export function locationMatchesServiceZones(
  location: { address?: string; suburb?: string; postcode?: string },
  city: City,
  zones: ServiceZone[],
) {
  const searchText = [location.address, location.suburb, location.postcode].filter(Boolean).join(' ')
  if (!searchText.trim()) return false
  return findMatchingZones(searchText, city, { ...DEFAULT_AVAILABILITY_CONFIG, zones }).length > 0
}

function getWeekdayForDate(dateString: string): Weekday | null {
  if (!dateString) return null
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const dayNames: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return dayNames[date.getDay()] ?? null
}

function buildSlotWindow(dateString: string, startTime: string, endTime: string, city: City) {
  const timeZone = getCityTimeZone(city)
  const start = getDateTimeInTimeZone(dateString, startTime, timeZone)
  const end = getDateTimeInTimeZone(dateString, endTime, timeZone)
  return { start, end }
}

function slotIsBlocked(slot: WeeklyAvailabilitySlot, dateString: string, blocks: OneOffAvailabilityBlock[], city: City) {
  if (!dateString) return false
  const { start, end } = buildSlotWindow(dateString, slot.startTime, slot.endTime, city)

  return blocks.some((block) => {
    if (!block.active || block.assigneeId !== slot.assigneeId) return false
    const blockStart = new Date(block.startsAt)
    const blockEnd = new Date(block.endsAt)
    if (Number.isNaN(blockStart.getTime()) || Number.isNaN(blockEnd.getTime())) return false
    return start < blockEnd && end > blockStart
  })
}

function formatDateForAvailability(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function timeFromMinutes(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function formatTimeForLabel(time: string): string {
  const minutes = minutesFromTime(time)
  const hours = Math.floor(minutes / 60)
  const suffix = hours >= 12 ? 'pm' : 'am'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes % 60).padStart(2, '0')}${suffix}`
}

function formatWeekdayForLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

type ReservedInspection = {
  assigneeId: string
  start: Date
  end: Date
}

function appointmentOverlapsReservation(
  start: Date,
  end: Date,
  reservation: ReservedInspection,
): boolean {
  const bufferMs = INSPECTION_BUFFER_MINUTES * 60 * 1000
  return start.getTime() < reservation.end.getTime() + bufferMs && end.getTime() + bufferMs > reservation.start.getTime()
}

function getAvailableAppointments(
  slot: WeeklyAvailabilitySlot,
  dateString: string,
  city: City,
  reservations: ReservedInspection[],
): Array<{ startTime: string; endTime: string }> {
  const slotStart = minutesFromTime(slot.startTime)
  const slotEnd = minutesFromTime(slot.endTime)
  const appointments: Array<{ startTime: string; endTime: string }> = []

  for (
    let startMinutes = slotStart;
    startMinutes + INSPECTION_DURATION_MINUTES <= slotEnd;
    startMinutes += INSPECTION_DURATION_MINUTES + INSPECTION_BUFFER_MINUTES
  ) {
    const startTime = timeFromMinutes(startMinutes)
    const endTime = timeFromMinutes(startMinutes + INSPECTION_DURATION_MINUTES)
    const start = getDateTimeInTimeZone(dateString, startTime, getCityTimeZone(city))
    const end = getDateTimeInTimeZone(dateString, endTime, getCityTimeZone(city))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue

    const blocked = reservations.some(
      (reservation) =>
        (reservation.assigneeId === '' || reservation.assigneeId === slot.assigneeId) &&
        appointmentOverlapsReservation(start, end, reservation),
    )
    if (!blocked) appointments.push({ startTime, endTime })
  }

  return appointments
}

async function getReservedInspections(city: City, startDate: string, daysToShow: number): Promise<ReservedInspection[]> {
  const timeZone = getCityTimeZone(city)
  const start = getDateTimeInTimeZone(startDate, '00:00', timeZone)
  const endDate = new Date(start)
  endDate.setUTCDate(endDate.getUTCDate() + daysToShow + 2)

  if (Number.isNaN(start.getTime()) || Number.isNaN(endDate.getTime())) return []

  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('bookings')
      .select('inputs, inspection_status, inspection_scheduled_for, status')
      .not('inspection_scheduled_for', 'is', null)
      .gte('inspection_scheduled_for', start.toISOString())
      .lt('inspection_scheduled_for', endDate.toISOString())
      .limit(1000)

    if (error) {
      console.error('[availability] Failed to load reserved inspections:', error)
      return []
    }

    return (data ?? []).flatMap((row) => {
      if (row.status === 'cancelled' || row.inspection_status === 'cancelled') return []
      const scheduledFor = new Date(String(row.inspection_scheduled_for ?? ''))
      if (Number.isNaN(scheduledFor.getTime())) return []
      const inputs = row.inputs && typeof row.inputs === 'object' ? row.inputs as Record<string, unknown> : {}
      const assigneeId = typeof inputs.preferredInspectionAssigneeId === 'string'
        ? inputs.preferredInspectionAssigneeId
        : ''
      return [{
        assigneeId,
        start: scheduledFor,
        end: new Date(scheduledFor.getTime() + INSPECTION_DURATION_MINUTES * 60 * 1000),
      }]
    })
  } catch (error) {
    console.error('[availability] Unexpected error loading reserved inspections:', error)
    return []
  }
}

function getAvailabilitySuggestionsForConfig(
  config: AvailabilityConfig,
  matchingZones: ServiceZone[],
  city: City,
  preferredDate?: string,
  reservations: ReservedInspection[] = []
): AvailabilitySuggestion[] {
  const matchingZoneIds = new Set(matchingZones.map((zone) => zone.id))
  const zoneMap = new Map(matchingZones.map((zone) => [zone.id, zone.name]))
  const assigneeMap = new Map(config.assignees.map((assignee) => [assignee.id, assignee]))
  const targetDay = preferredDate ? getWeekdayForDate(preferredDate) : null

  return config.weeklySlots
    .filter((slot) => {
      if (!slot.active || slot.city !== city) return false
      if (!slot.zoneIds.some((zoneId) => matchingZoneIds.has(zoneId))) return false
      const assignee = assigneeMap.get(slot.assigneeId)
      if (!assignee || !assignee.active) return false
      if (targetDay && slot.day !== targetDay) return false
      if (preferredDate && slotIsBlocked(slot, preferredDate, config.oneOffBlocks, city)) return false
      return true
    })
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
    .flatMap((slot) => {
      const assignee = assigneeMap.get(slot.assigneeId)
      const appointments = preferredDate
        ? getAvailableAppointments(slot, preferredDate, city, reservations)
        : [{ startTime: slot.startTime, endTime: timeFromMinutes(minutesFromTime(slot.startTime) + INSPECTION_DURATION_MINUTES) }]

      return appointments.map((appointment) => ({
          // Include the start time so each hourly appointment is independently selectable.
          slotId: `${slot.id}:${appointment.startTime}`,
          label: `${formatWeekdayForLabel(slot.day)} ${formatTimeForLabel(appointment.startTime)}`,
          windowLabel: slot.label,
          day: slot.day,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          zoneNames: slot.zoneIds.map((zoneId) => zoneMap.get(zoneId)).filter(Boolean) as string[],
          assigneeId: slot.assigneeId,
          assigneeName: assignee?.name ?? 'Assigned quoter',
          calendarId: assignee?.calendarId || undefined,
        }))
    })
    .slice(0, config.settings.maxSlotsToShow)
}

function getCalendarStartDate(): Date {
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() + 1)
  return start
}

export async function getAvailabilityConfig(): Promise<AvailabilityConfig> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('site_content')
      .select('content')
      .eq('key', AVAILABILITY_CONTENT_KEY)
      .maybeSingle()

    if (error || !data?.content) {
      if (error) {
        console.error('[availability] Failed to load config:', error)
      }
      return cloneDefaultConfig()
    }

    return mergeConfig(JSON.parse(data.content))
  } catch (error) {
    console.error('[availability] Unexpected error loading config:', error)
    return cloneDefaultConfig()
  }
}

export async function saveAvailabilityConfig(config: AvailabilityConfig): Promise<AvailabilityConfig> {
  const db = getAdminSupabase()
  const merged = mergeConfig(config)

  const { error } = await db
    .from('site_content')
    .upsert({
      key: AVAILABILITY_CONTENT_KEY,
      title: AVAILABILITY_CONTENT_TITLE,
      content: JSON.stringify(merged),
      group_name: 'availability',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) throw error

  return merged
}

export function getAvailabilityAssignee(config: AvailabilityConfig, assigneeId: string) {
  return config.assignees.find((assignee) => assignee.id === assigneeId) ?? null
}

export function getAvailabilityAssigneeByUsername(config: AvailabilityConfig, username: string) {
  const normalized = username.trim().toLowerCase()
  if (!normalized) return null
  return (
    config.assignees.find((assignee) => (assignee.username ?? '').trim().toLowerCase() === normalized) ?? null
  )
}

export async function getAvailabilitySuggestions(
  location: { address?: string; suburb?: string; postcode?: string },
  city: City,
  preferredDate?: string
): Promise<AvailabilitySuggestion[]> {
  const result = await getAvailabilityCalendar(location, city, preferredDate)
  return result.suggestions
}

/**
 * Resolve the active inspection agents responsible for a location without
 * requiring a customer to choose an inspection date first.
 *
 * Quotes are sent before a booking exists, so routing them through the
 * date-specific availability suggestions would be unnecessarily fragile.
 */
export async function getAvailabilityAssigneesForLocation(
  location: { address?: string; suburb?: string; postcode?: string },
  city: City,
): Promise<AvailabilityAssignee[]> {
  const config = await getAvailabilityConfig()
  const searchText = [location.address, location.suburb, location.postcode].filter(Boolean).join(' ')
  const matchingZones = searchText.trim() ? findMatchingZones(searchText, city, config) : []
  const matchingZoneIds = new Set(matchingZones.map((zone) => zone.id))
  const responsibleAssigneeIds = new Set(
    config.weeklySlots
      .filter(
        (slot) =>
          slot.active &&
          slot.city === city &&
          slot.zoneIds.some((zoneId) => matchingZoneIds.has(zoneId)),
      )
      .map((slot) => slot.assigneeId),
  )

  const zoneAssignees = config.assignees.filter(
    (assignee) => assignee.active && assignee.city === city && responsibleAssigneeIds.has(assignee.id),
  )

  // Keep a city quote routable while an admin is still configuring the zone
  // list, or when a new suburb has not been added to a zone yet.
  return zoneAssignees.length > 0
    ? zoneAssignees
    : config.assignees.filter((assignee) => assignee.active && assignee.city === city)
}

export async function getAvailabilityCalendar(
  location: { address?: string; suburb?: string; postcode?: string },
  city: City,
  preferredDate?: string,
  daysToShow = 90
): Promise<AvailabilityCalendarResult> {
  const searchText = [location.address, location.suburb, location.postcode].filter(Boolean).join(' ')
  if (!searchText.trim()) {
    return { zoneMatched: false, matchedZoneNames: [], suggestions: [], availableDates: [] }
  }

  const config = await getAvailabilityConfig()
  const matchingZones = findMatchingZones(searchText, city, config)
  const matchedZoneNames = matchingZones.map((zone) => zone.name)

  if (matchingZones.length === 0) {
    return { zoneMatched: false, matchedZoneNames, suggestions: [], availableDates: [] }
  }

  const calendarDate = getCalendarStartDate()
  const firstCalendarDate = formatDateForAvailability(calendarDate)
  const reservations = await getReservedInspections(city, firstCalendarDate, daysToShow)
  const suggestions = getAvailabilitySuggestionsForConfig(config, matchingZones, city, preferredDate, reservations)
  const availableDates: string[] = []
  const dateCursor = getCalendarStartDate()

  for (let index = 0; index < daysToShow; index += 1) {
    const dateString = formatDateForAvailability(dateCursor)
    if (getAvailabilitySuggestionsForConfig(config, matchingZones, city, dateString, reservations).length > 0) {
      availableDates.push(dateString)
    }
    dateCursor.setDate(dateCursor.getDate() + 1)
  }

  const nextAvailableDate = availableDates[0]
  const nextAvailableSuggestions = nextAvailableDate
    ? getAvailabilitySuggestionsForConfig(config, matchingZones, city, nextAvailableDate, reservations)
    : []

  return {
    zoneMatched: true,
    matchedZoneNames,
    suggestions,
    availableDates,
    nextAvailableDate,
    nextAvailableSuggestions,
  }
}
