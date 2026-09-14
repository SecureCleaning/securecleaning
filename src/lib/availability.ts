import { getAdminSupabase } from '@/lib/supabase'
import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import type { City } from '@/lib/types'
import { normalizeAvailabilityAssigneeCity } from '@/lib/availabilityNormalization'
import { APPROVED_SERVICE_ZONES } from '@/lib/availabilityZoneCatalog'

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
  excludedMatchTerms?: string[]
  excludedPostcodes?: string[]
  anchors?: ServiceZoneAnchor[]
  notes?: string
}

export type ServiceZoneAnchor = {
  id: string
  label: string
  latitude: number
  longitude: number
  radiusKm: number
}

export type AvailabilityMatchMethod = 'postcode' | 'suburb' | 'radius' | 'none'

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
  ownerOperatorId?: string
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
  matchMethod: AvailabilityMatchMethod
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
const BLOCKOUT_BUFFER_MINUTES = 60

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
  zones: APPROVED_SERVICE_ZONES,
  weeklySlots: [
    {
      id: 'melb_mon_12_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Monday 12:00pm–3:00pm',
      day: 'monday',
      startTime: '12:00',
      endTime: '15:00',
      zoneIds: ['melb_v2_north_northeast'],
      active: true,
      notes: 'North, north-east and Lilydale route.',
    },
    {
      id: 'melb_tue_10_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Tuesday 10:00am–3:00pm',
      day: 'tuesday',
      startTime: '10:00',
      endTime: '15:00',
      zoneIds: ['melb_v2_west_werribee', 'melb_v2_melton_sunbury_gisborne'],
      active: true,
      notes: 'West, Werribee, Melton, Sunbury and Gisborne route.',
    },
    {
      id: 'melb_wed_10_2',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Wednesday 10:00am–2:00pm',
      day: 'wednesday',
      startTime: '10:00',
      endTime: '14:00',
      zoneIds: ['melb_v2_inner_bayside', 'melb_v2_south_southeast'],
      active: true,
      notes: 'Inner City, Bayside and south-east route.',
    },
    {
      id: 'melb_thu_10_3',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Thursday 10:00am–3:00pm',
      day: 'thursday',
      startTime: '10:00',
      endTime: '15:00',
      zoneIds: ['melb_v2_west_werribee', 'melb_v2_geelong_torquay'],
      active: true,
      notes: 'Werribee, Geelong and Torquay route.',
    },
    {
      id: 'melb_fri_10_12',
      city: 'melbourne',
      assigneeId: 'melb_primary',
      label: 'Friday 10:00am–12:00pm',
      day: 'friday',
      startTime: '10:00',
      endTime: '12:00',
      zoneIds: ['melb_v2_south_southeast'],
      active: true,
      notes: 'Frankston, south-east and Mornington Peninsula route.',
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

function mergeUniqueList(...lists: string[][]) {
  return [...new Set(lists.flat().map((item) => item.trim()).filter(Boolean))]
}

function mergeDefaultZoneAnchors(defaultAnchors: ServiceZoneAnchor[], savedAnchors: ServiceZoneAnchor[]) {
  const anchors = new Map(defaultAnchors.map((anchor) => [anchor.id, anchor]))
  for (const anchor of savedAnchors) anchors.set(anchor.id, anchor)
  return [...anchors.values()].slice(0, 40)
}

function sanitizeCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

function sanitizeZoneAnchors(value: unknown, zoneId: string): ServiceZoneAnchor[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((anchor, index) => {
    if (!anchor || typeof anchor !== 'object') return []
    const source = anchor as Partial<ServiceZoneAnchor>
    const latitude = sanitizeCoordinate(source.latitude, -44, -10)
    const longitude = sanitizeCoordinate(source.longitude, 112, 154)
    const radiusKm = Number(source.radiusKm)
    if (latitude === null || longitude === null || !Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 100) return []
    return [{
      id: String(source.id || `${zoneId}-anchor-${index + 1}`).slice(0, 120),
      label: String(source.label || `Anchor ${index + 1}`).slice(0, 120),
      latitude,
      longitude,
      radiusKm,
    }]
  }).slice(0, 40)
}

export function validateAvailabilityZoneConfig(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return 'Availability configuration is invalid.'
  const zones = (candidate as { zones?: unknown }).zones
  if (!Array.isArray(zones)) return 'Service zones must be a list.'
  const zoneIds = new Set<string>()
  for (const [zoneIndex, zone] of zones.entries()) {
    if (!zone || typeof zone !== 'object') return `Zone ${zoneIndex + 1} is invalid.`
    const source = zone as Partial<ServiceZone>
    const zoneId = String(source.id ?? '').trim()
    if (!zoneId || zoneIds.has(zoneId)) return 'Every service zone must have a unique ID.'
    zoneIds.add(zoneId)
    if (!String(source.name ?? '').trim()) return `Zone ${zoneId} must have a name.`
    if (!['melbourne', 'sydney'].includes(String(source.city ?? ''))) return `Zone ${zoneId} has an invalid city.`
    if (!Array.isArray(source.matchTerms) || !Array.isArray(source.postcodes)) return `Zone ${zoneId} has invalid coverage lists.`
    if ((source.anchors ?? []).length > 40) return `Zone ${zoneId} has too many radius anchors.`
    for (const [anchorIndex, anchor] of (source.anchors ?? []).entries()) {
      const latitude = sanitizeCoordinate(anchor.latitude, -44, -10)
      const longitude = sanitizeCoordinate(anchor.longitude, 112, 154)
      const radiusKm = Number(anchor.radiusKm)
      if (!String(anchor.label ?? '').trim() || latitude === null || longitude === null || !Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 100) {
        return `Anchor ${anchorIndex + 1} in zone ${zoneId} must have a name, Australian coordinates, and a radius from 0.1 to 100 km.`
      }
    }
  }
  return null
}

export function mergeAvailabilityConfig(candidate: unknown): AvailabilityConfig {
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
      ? source.zones.map((zone, index) => {
          const zoneId = String(zone?.id ?? `zone-${index + 1}`)
          const defaultZone = fallback.zones.find((candidate) => candidate.id === zoneId)
          const savedAnchors = sanitizeZoneAnchors(zone?.anchors, zoneId)
          return {
            id: zoneId,
            name: String(zone?.name ?? `Zone ${index + 1}`),
            city: zone?.city === 'sydney' ? 'sydney' : 'melbourne',
            matchTerms: mergeUniqueList(defaultZone?.matchTerms ?? [], sanitizeList(zone?.matchTerms)),
            postcodes: mergeUniqueList(defaultZone?.postcodes ?? [], sanitizeList(zone?.postcodes)),
            excludedMatchTerms: sanitizeList(zone?.excludedMatchTerms),
            excludedPostcodes: sanitizeList(zone?.excludedPostcodes),
            anchors: mergeDefaultZoneAnchors(defaultZone?.anchors ?? [], savedAnchors),
            notes: typeof zone?.notes === 'string' ? zone.notes : '',
          }
        })
      : fallback.zones,
    assignees: Array.isArray(source.assignees)
      ? source.assignees.map((assignee, index) => {
          const fallbackAssignee = fallback.assignees[index]
          const normalizedCity = normalizeAvailabilityAssigneeCity(assignee?.city, fallbackAssignee?.city ?? 'melbourne')
          return {
            id: String(assignee?.id ?? `assignee-${index + 1}`),
            name: String(assignee?.name ?? `Assignee ${index + 1}`),
            username: typeof assignee?.username === 'string' ? assignee.username : '',
            city: normalizedCity.city,
            ownerOperatorId: typeof assignee?.ownerOperatorId === 'string' ? assignee.ownerOperatorId : '',
            email: typeof assignee?.email === 'string' ? assignee.email : '',
            calendarId: typeof assignee?.calendarId === 'string' ? assignee.calendarId : '',
            calendarViewUrl: typeof assignee?.calendarViewUrl === 'string' ? assignee.calendarViewUrl : '',
            calendarSubscriptionUrl:
              typeof assignee?.calendarSubscriptionUrl === 'string' ? assignee.calendarSubscriptionUrl : '',
            accessCodeHash: typeof assignee?.accessCodeHash === 'string' ? assignee.accessCodeHash : '',
            active: normalizedCity.supported && Boolean(assignee?.active ?? true),
            notes: typeof assignee?.notes === 'string' ? assignee.notes : '',
          }
        })
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
  return matchServiceZones({ address: searchText }, city, config.zones).zones
}

function haversineDistanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(latitudeB - latitudeA)
  const longitudeDelta = toRadians(longitudeB - longitudeA)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function matchServiceZones(
  location: { address?: string; suburb?: string; postcode?: string; latitude?: number; longitude?: number },
  city: City,
  zones: ServiceZone[],
): { zones: ServiceZone[]; method: AvailabilityMatchMethod; distanceKm?: number } {
  const searchText = [location.address, location.suburb, location.postcode].filter(Boolean).join(' ')
  const normalizedLocality = normalizeText(location.suburb || location.address || '')
  const postcode = location.postcode?.match(/^\d{4}$/)?.[0] ?? extractPostcode(searchText)
  const latitude = sanitizeCoordinate(location.latitude, -44, -10)
  const longitude = sanitizeCoordinate(location.longitude, 112, 154)
  const exactPostcode: ServiceZone[] = []
  const exactTerm: ServiceZone[] = []
  const radiusMatches: Array<{ zone: ServiceZone; distanceKm: number }> = []

  for (const zone of zones) {
    if (zone.city !== city) continue
    const excludedByPostcode = Boolean(postcode && (zone.excludedPostcodes ?? []).includes(postcode))
    const excludedByTerm = (zone.excludedMatchTerms ?? []).some((term) => {
      const normalizedTerm = normalizeText(term)
      return normalizedTerm.length > 0 && normalizedLocality.includes(normalizedTerm)
    })
    if (excludedByPostcode || excludedByTerm) continue
    if (postcode && zone.postcodes.includes(postcode)) {
      exactPostcode.push(zone)
      continue
    }
    const termMatch = zone.matchTerms.some((term) => {
      const normalizedTerm = normalizeText(term)
      return normalizedTerm.length > 0 && normalizedLocality.includes(normalizedTerm)
    })
    if (termMatch) {
      exactTerm.push(zone)
      continue
    }
    if (latitude !== null && longitude !== null) {
      const distances = (zone.anchors ?? []).map((anchor) => ({
        distanceKm: haversineDistanceKm(latitude, longitude, anchor.latitude, anchor.longitude),
        radiusKm: anchor.radiusKm,
      }))
      const nearest = distances.filter((candidate) => candidate.distanceKm <= candidate.radiusKm + 0.000001)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0]
      if (nearest) radiusMatches.push({ zone, distanceKm: nearest.distanceKm })
    }
  }

  if (exactPostcode.length > 0) return { zones: exactPostcode, method: 'postcode' }
  if (exactTerm.length > 0) return { zones: exactTerm, method: 'suburb' }
  radiusMatches.sort((a, b) => a.distanceKm - b.distanceKm || a.zone.id.localeCompare(b.zone.id))
  return radiusMatches.length > 0
    ? { zones: radiusMatches.map((match) => match.zone), method: 'radius', distanceKm: radiusMatches[0].distanceKm }
    : { zones: [], method: 'none' }
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
  location: { address?: string; suburb?: string; postcode?: string; latitude?: number; longitude?: number },
  city: City,
  zones: ServiceZone[],
) {
  return matchServiceZones(location, city, zones).zones.length > 0
}

function getWeekdayForDate(dateString: string): Weekday | null {
  if (!dateString) return null
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const dayNames: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return dayNames[date.getDay()] ?? null
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

export function appointmentStartConflictsWithBlock(
  appointmentStart: Date,
  blockStart: Date,
  blockEnd: Date,
): boolean {
  if (
    Number.isNaN(appointmentStart.getTime())
    || Number.isNaN(blockStart.getTime())
    || Number.isNaN(blockEnd.getTime())
    || blockEnd <= blockStart
  ) return false

  const bufferMs = BLOCKOUT_BUFFER_MINUTES * 60 * 1000
  return appointmentStart.getTime() >= blockStart.getTime() - bufferMs
    && appointmentStart.getTime() < blockEnd.getTime() + bufferMs
}

export function getInspectionAppointmentWindows(
  startTime: string,
  endTime: string,
): Array<{ startTime: string; endTime: string }> {
  const slotStart = minutesFromTime(startTime)
  const slotEnd = minutesFromTime(endTime)
  const appointments: Array<{ startTime: string; endTime: string }> = []

  for (
    let startMinutes = slotStart;
    startMinutes <= slotEnd;
    startMinutes += INSPECTION_DURATION_MINUTES + INSPECTION_BUFFER_MINUTES
  ) {
    appointments.push({
      startTime: timeFromMinutes(startMinutes),
      endTime: timeFromMinutes(startMinutes + INSPECTION_DURATION_MINUTES),
    })
  }

  return appointments
}

function getAvailableAppointments(
  slot: WeeklyAvailabilitySlot,
  dateString: string,
  city: City,
  reservations: ReservedInspection[],
  blocks: OneOffAvailabilityBlock[],
): Array<{ startTime: string; endTime: string }> {
  return getInspectionAppointmentWindows(slot.startTime, slot.endTime).filter((appointment) => {
    const start = getDateTimeInTimeZone(dateString, appointment.startTime, getCityTimeZone(city))
    const end = getDateTimeInTimeZone(dateString, appointment.endTime, getCityTimeZone(city))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false

    const blocked = reservations.some(
      (reservation) =>
        (reservation.assigneeId === '' || reservation.assigneeId === slot.assigneeId) &&
        appointmentOverlapsReservation(start, end, reservation),
    )
    if (blocked) return false

    return !blocks.some((block) => {
      if (!block.active || block.assigneeId !== slot.assigneeId) return false
      return appointmentStartConflictsWithBlock(start, new Date(block.startsAt), new Date(block.endsAt))
    })
  })
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
      return true
    })
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
    .flatMap((slot) => {
      const assignee = assigneeMap.get(slot.assigneeId)
      const appointments = preferredDate
        ? getAvailableAppointments(slot, preferredDate, city, reservations, config.oneOffBlocks)
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

    return mergeAvailabilityConfig(JSON.parse(data.content))
  } catch (error) {
    console.error('[availability] Unexpected error loading config:', error)
    return cloneDefaultConfig()
  }
}

export async function saveAvailabilityConfig(config: AvailabilityConfig): Promise<AvailabilityConfig> {
  const db = getAdminSupabase()
  const merged = mergeAvailabilityConfig(config)

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
  location: { address?: string; suburb?: string; postcode?: string; latitude?: number; longitude?: number },
  city: City,
  preferredDate?: string,
  daysToShow = 90
): Promise<AvailabilityCalendarResult> {
  const searchText = [location.address, location.suburb, location.postcode].filter(Boolean).join(' ')
  if (!searchText.trim()) {
    return { zoneMatched: false, matchMethod: 'none', matchedZoneNames: [], suggestions: [], availableDates: [] }
  }

  const config = await getAvailabilityConfig()
  const match = matchServiceZones(location, city, config.zones)
  const matchingZones = match.zones
  const matchedZoneNames = matchingZones.map((zone) => zone.name)

  if (matchingZones.length === 0) {
    return { zoneMatched: false, matchMethod: 'none', matchedZoneNames, suggestions: [], availableDates: [] }
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
    matchMethod: match.method,
    matchedZoneNames,
    suggestions,
    availableDates,
    nextAvailableDate,
    nextAvailableSuggestions,
  }
}
