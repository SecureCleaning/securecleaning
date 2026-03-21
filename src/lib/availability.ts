import { getAdminSupabase } from '@/lib/supabase'
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
  label: string
  day: Weekday
  startTime: string
  endTime: string
  zoneIds: string[]
  active: boolean
  notes?: string
}

export type AvailabilityConfig = {
  settings: {
    maxSlotsToShow: number
  }
  zones: ServiceZone[]
  weeklySlots: WeeklyAvailabilitySlot[]
}

export type AvailabilitySuggestion = {
  slotId: string
  label: string
  day: Weekday
  startTime: string
  endTime: string
  zoneNames: string[]
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

export const DEFAULT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  settings: {
    maxSlotsToShow: 5,
  },
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
      label: 'Friday 10:00am–12:00pm',
      day: 'friday',
      startTime: '10:00',
      endTime: '12:00',
      zoneIds: ['melb_south_east'],
      active: true,
      notes: 'South East Melbourne',
    },
  ],
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
    weeklySlots: Array.isArray(source.weeklySlots)
      ? source.weeklySlots.map((slot, index) => ({
          id: String(slot?.id ?? `slot-${index + 1}`),
          city: slot?.city === 'sydney' ? 'sydney' : 'melbourne',
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
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractPostcode(address: string): string | null {
  const match = address.match(/\b(\d{4})\b/)
  return match?.[1] ?? null
}

function findMatchingZones(address: string, city: City, config: AvailabilityConfig): ServiceZone[] {
  const normalizedAddress = normalizeText(address)
  const postcode = extractPostcode(address)

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

export async function getAvailabilitySuggestions(address: string, city: City): Promise<AvailabilitySuggestion[]> {
  if (!address.trim()) return []

  const config = await getAvailabilityConfig()
  const matchingZones = findMatchingZones(address, city, config)

  if (matchingZones.length === 0) {
    return []
  }

  const matchingZoneIds = new Set(matchingZones.map((zone) => zone.id))
  const zoneMap = new Map(matchingZones.map((zone) => [zone.id, zone.name]))

  return config.weeklySlots
    .filter((slot) => slot.active && slot.city === city && slot.zoneIds.some((zoneId) => matchingZoneIds.has(zoneId)))
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
    .slice(0, config.settings.maxSlotsToShow)
    .map((slot) => ({
      slotId: slot.id,
      label: slot.label,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      zoneNames: slot.zoneIds.map((zoneId) => zoneMap.get(zoneId)).filter(Boolean) as string[],
    }))
}
