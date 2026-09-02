import { getAdminSupabase } from '@/lib/supabase'
import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import type { City } from '@/lib/types'
import { normalizeAvailabilityAssigneeCity } from '@/lib/availabilityNormalization'

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
      anchors: [
        { id: 'brighton-10km', label: 'Brighton', latitude: -37.906, longitude: 145.001, radiusKm: 10 },
        { id: 'glen-waverley-10km', label: 'Glen Waverley', latitude: -37.879, longitude: 145.164, radiusKm: 10 },
        { id: 'box-hill-10km', label: 'Box Hill', latitude: -37.819, longitude: 145.125, radiusKm: 10 },
        { id: 'ringwood-10km', label: 'Ringwood', latitude: -37.814, longitude: 145.229, radiusKm: 10 },
      ],
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
      postcodes: ['3141', '3142', '3143', '3144', '3145', '3146', '3147', '3148', '3149', '3150', '3151', '3152', '3153', '3154', '3155', '3156', '3161', '3162', '3163', '3165', '3166', '3167', '3168', '3169', '3170', '3171', '3172', '3173', '3174', '3175', '3177', '3178', '3185', '3186', '3187', '3188', '3189', '3190', '3191', '3192', '3193', '3194', '3195', '3196', '3197', '3198', '3199', '3200', '3201', '3204', '3802', '3803', '3804', '3805', '3806', '3807', '3808', '3809', '3810'],
      anchors: [
        { id: 'south-yarra-10km', label: 'South Yarra', latitude: -37.839, longitude: 144.992, radiusKm: 10 },
        { id: 'clayton-10km', label: 'Clayton', latitude: -37.925, longitude: 145.12, radiusKm: 10 },
        { id: 'dandenong-10km', label: 'Dandenong', latitude: -37.987, longitude: 145.215, radiusKm: 10 },
        { id: 'berwick-10km', label: 'Berwick', latitude: -38.033, longitude: 145.344, radiusKm: 10 },
      ],
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
      postcodes: ['3000', '3002', '3003', '3004', '3005', '3006', '3008', '3051', '3052', '3053', '3054', '3065', '3066', '3067', '3068', '3121', '3205', '3206', '3207'],
      anchors: [
        { id: 'melbourne-cbd-10km', label: 'Melbourne CBD', latitude: -37.8136, longitude: 144.9631, radiusKm: 10 },
      ],
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
        'preston', 'reservoir', 'thornbury', 'northcote', 'fairfield', 'alphington', 'ivanhoe',
        'heidelberg', 'bellfield', 'bundoora', 'macleod', 'watsonia', 'greensborough',
        'thomastown', 'lalor', 'epping', 'mill park', 'fawkner', 'campbellfield',
        'broadmeadows', 'coolaroo', 'meadow heights', 'craigieburn', 'roxburgh park',
        'airport west', 'keilor', 'keilor east', 'keilor park', 'taylors lakes', 'sydenham',
        'caroline springs', 'deer park', 'point cook', 'laverton', 'hoppers crossing',
        'werribee', 'tarneit', 'truganina', 'melton'
      ],
      postcodes: ['3003', '3011', '3012', '3013', '3015', '3016', '3018', '3019', '3020', '3021', '3022', '3023', '3024', '3025', '3026', '3027', '3028', '3029', '3030', '3031', '3032', '3033', '3034', '3036', '3037', '3038', '3039', '3040', '3041', '3042', '3043', '3044', '3045', '3046', '3047', '3048', '3049', '3055', '3056', '3057', '3058', '3059', '3060', '3061', '3062', '3063', '3064', '3070', '3071', '3072', '3073', '3074', '3075', '3076', '3078', '3079', '3081', '3082', '3083', '3084', '3085', '3087', '3088', '3089', '3090', '3091', '3093', '3094', '3095', '3096', '3097', '3099'],
      anchors: [
        { id: 'preston-10km', label: 'Preston', latitude: -37.739, longitude: 145.001, radiusKm: 10 },
        { id: 'essendon-10km', label: 'Essendon', latitude: -37.75, longitude: 144.911, radiusKm: 10 },
        { id: 'footscray-10km', label: 'Footscray', latitude: -37.8, longitude: 144.9, radiusKm: 10 },
        { id: 'sunshine-10km', label: 'Sunshine', latitude: -37.783, longitude: 144.833, radiusKm: 10 },
        { id: 'werribee-10km', label: 'Werribee', latitude: -37.9, longitude: 144.66, radiusKm: 10 },
        { id: 'melton-10km', label: 'Melton', latitude: -37.683, longitude: 144.583, radiusKm: 10 },
      ],
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
      anchors: [
        { id: 'geelong-10km', label: 'Geelong', latitude: -38.15, longitude: 144.362, radiusKm: 10 },
        { id: 'torquay-10km', label: 'Torquay', latitude: -38.332, longitude: 144.323, radiusKm: 10 },
      ],
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
    return !blocked
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
