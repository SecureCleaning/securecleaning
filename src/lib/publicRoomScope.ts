import type { PremisesType, PublicRoomScopeItem, PublicRoomScopeType, QuoteAddOns } from '@/lib/types'

const EMPTY_ADD_ONS: QuoteAddOns = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  glassCleaningRequired: false,
  consumables: false,
  highTouchDisinfection: false,
  carpetSteam: false,
}

export type PublicRoomScopeOption = {
  type: PublicRoomScopeType
  label: string
  description: string
  allowMopping: boolean
  recommendedFor: PremisesType[]
}

export const PUBLIC_ROOM_SCOPE_OPTIONS: PublicRoomScopeOption[] = [
  {
    type: 'female_bathroom',
    label: 'Female bathroom',
    description: 'Female bathroom facilities with toilets, basins and general sanitary servicing.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'male_bathroom',
    label: 'Male bathroom',
    description: 'Male bathroom facilities with toilets, basins, urinals and general sanitary servicing.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'accessible_bathroom',
    label: 'Accessible / disabled bathroom',
    description: 'Accessible bathroom facilities, including disabled toilet servicing where provided.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'bathroom',
    label: 'General bathroom / amenities',
    description: 'A bathroom or amenities area where the exact facility type is not yet known.',
    allowMopping: true,
    recommendedFor: [],
  },
  {
    type: 'kitchen',
    label: 'Kitchens / kitchenettes',
    description: 'Tea points, staff kitchens and kitchenette spaces.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'meeting_room',
    label: 'Meeting / board rooms',
    description: 'Conference rooms, boardrooms and enclosed meeting spaces.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'other'],
  },
  {
    type: 'reception',
    label: 'Reception / waiting area',
    description: 'Entry lounges, reception desks and client waiting zones.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'retail', 'gym', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'hallway',
    label: 'Hallways / common areas',
    description: 'Corridors, circulation areas and internal shared walkways.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'stairs',
    label: 'Stairs',
    description: 'Internal staircases, landings and handrails that need to be included in the cleaning scope.',
    allowMopping: true,
    recommendedFor: [],
  },
  {
    type: 'breakout',
    label: 'Breakout / staff area',
    description: 'Lunchrooms, shared staff hubs and breakout spaces.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'industrial', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'],
  },
  {
    type: 'warehouse',
    label: 'Warehouse / open area',
    description: 'Open floor space, back-of-house, warehouse or dispatch zones.',
    allowMopping: true,
    recommendedFor: ['industrial', 'warehouse', 'retail'],
  },
  {
    type: 'other',
    label: 'Other room / area',
    description: 'Any other space you want us to note before the inspection.',
    allowMopping: true,
    recommendedFor: ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'other'],
  },
]

export function getSuggestedPublicRoomScopeOptions(premisesType?: PremisesType) {
  if (!premisesType) {
    return PUBLIC_ROOM_SCOPE_OPTIONS.filter((option) =>
      ['female_bathroom', 'male_bathroom', 'accessible_bathroom', 'kitchen', 'reception', 'hallway'].includes(option.type)
    )
  }

  return PUBLIC_ROOM_SCOPE_OPTIONS.filter(
    (option) => option.type !== 'other' && option.recommendedFor.includes(premisesType)
  )
}

export function getAdditionalPublicRoomScopeOptions(premisesType?: PremisesType) {
  const suggestedTypes = new Set(getSuggestedPublicRoomScopeOptions(premisesType).map((option) => option.type))

  return PUBLIC_ROOM_SCOPE_OPTIONS.filter(
    (option) => option.type !== 'other' && !suggestedTypes.has(option.type)
  )
}

export function getRoomScopeGuidance(premisesType?: PremisesType) {
  switch (premisesType) {
    case 'office':
      return 'Most office quotes start with bathrooms, kitchens, meeting rooms and reception areas.'
    case 'medical':
      return 'For medical sites, start with bathrooms, reception, treatment support spaces and shared hallways.'
    case 'childcare':
      return 'For childcare centres, bathrooms, kitchens, reception and shared circulation areas are the main spaces to flag.'
    case 'industrial':
      return 'For industrial sites, bathrooms, lunchrooms, shared areas and warehouse/open floor spaces are usually the key extras.'
    case 'retail':
      return 'For retail spaces, bathrooms, reception/front-of-house, shared areas and warehouse/back-of-house are the main extras.'
    case 'gym':
      return 'For gyms, bathrooms, reception, breakout/staff areas and shared circulation spaces are usually the most important to note.'
    case 'function_centre':
      return 'For function centres, flag the event floor, bathrooms, kitchens, reception and service areas you want included.'
    case 'sports_facility':
      return 'For sports facilities, start with activity areas, change rooms, showers, bathrooms, reception and shared circulation spaces.'
    case 'warehouse':
      return 'For warehouses, start with bathrooms, kitchens, shared access areas and warehouse/open floor zones.'
    case 'other':
      return 'Pick the spaces you already know about and we will confirm the full scope during inspection.'
    default:
      return 'Select the spaces you already know about now. We will confirm the room-by-room detail during inspection.'
  }
}

function defaultLabelForType(type: PublicRoomScopeType) {
  return PUBLIC_ROOM_SCOPE_OPTIONS.find((option) => option.type === type)?.label ?? 'Other room / area'
}

export function defaultMoppingRequiredForType(type: PublicRoomScopeType) {
  return type === 'bathroom' || type === 'female_bathroom' || type === 'male_bathroom' || type === 'accessible_bathroom' || type === 'kitchen'
}

export function isBathroomRoomScopeType(type: PublicRoomScopeType) {
  return type === 'bathroom' || type === 'female_bathroom' || type === 'male_bathroom' || type === 'accessible_bathroom'
}

export function createPublicRoomScopeItem(type: PublicRoomScopeType = 'other', isCustom = false): PublicRoomScopeItem {
  return {
    id: `room-scope-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: defaultLabelForType(type),
    quantity: 1,
    moppingRequired: defaultMoppingRequiredForType(type),
    isCustom,
  }
}

export function sanitizePublicRoomScope(candidate: unknown): PublicRoomScopeItem[] {
  if (!Array.isArray(candidate)) return []

  return candidate
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const source = item as Partial<PublicRoomScopeItem>
      const type = typeof source.type === 'string' && PUBLIC_ROOM_SCOPE_OPTIONS.some((option) => option.type === source.type)
        ? source.type as PublicRoomScopeType
        : 'other'

      return {
        id: typeof source.id === 'string' && source.id.trim() ? source.id : `room-scope-${index + 1}`,
        type,
        label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : defaultLabelForType(type),
        quantity: Number.isFinite(Number(source.quantity)) && Number(source.quantity) > 0 ? Math.round(Number(source.quantity)) : 1,
        moppingRequired:
          typeof source.moppingRequired === 'boolean' ? source.moppingRequired : defaultMoppingRequiredForType(type),
        isCustom: Boolean(source.isCustom),
      }
    })
}

export function deriveQuoteAddOnCountsFromRoomScope(roomScope: PublicRoomScopeItem[]) {
  const sanitized = sanitizePublicRoomScope(roomScope)

  return {
    bathrooms: sanitized
      .filter((room) => isBathroomRoomScopeType(room.type))
      .reduce((sum, room) => sum + room.quantity, 0),
    kitchens: sanitized
      .filter((room) => room.type === 'kitchen')
      .reduce((sum, room) => sum + room.quantity, 0),
    meetingRooms: sanitized
      .filter((room) => room.type === 'meeting_room')
      .reduce((sum, room) => sum + room.quantity, 0),
  }
}

export function mergeRoomScopeIntoAddOns(roomScope: PublicRoomScopeItem[], addOns?: Partial<QuoteAddOns>): QuoteAddOns {
  const counts = deriveQuoteAddOnCountsFromRoomScope(roomScope)

  return {
    ...EMPTY_ADD_ONS,
    ...(addOns ?? {}),
    bathrooms: counts.bathrooms,
    kitchens: counts.kitchens,
  }
}

export function summarizePublicRoomScope(roomScope?: PublicRoomScopeItem[]) {
  return sanitizePublicRoomScope(roomScope).map((room) => {
    const parts = [`${room.label} x${room.quantity}`]
    if (room.moppingRequired) {
      parts.push('mopping requested')
    }
    return parts.join(' · ')
  })
}
