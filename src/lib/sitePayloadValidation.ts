import type { City, PremisesType } from '@/lib/types'
import type { SitePayload } from '@/lib/sites'

const CITY_OPTIONS = new Set<City>(['melbourne', 'sydney'])
const PREMISES_OPTIONS = new Set<PremisesType>([
  'office',
  'medical',
  'industrial',
  'childcare',
  'retail',
  'gym',
  'warehouse',
  'function_centre',
  'sports_facility',
  'other',
])

const MAX_FLOOR_AREA = 10_000_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STRING_FIELDS = {
  siteName: 200,
  address: 500,
  suburb: 120,
  postcode: 20,
  accessNotes: 4_000,
  alarmNotes: 4_000,
  inductionNotes: 4_000,
  keyholderName: 200,
  keyholderPhone: 64,
} as const

type SiteStringField = keyof typeof STRING_FIELDS
type SiteMutationPayload = Partial<SitePayload>

export type SitePayloadValidationResult =
  | { success: true; payload: SiteMutationPayload; siteId?: string }
  | { success: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateStringField(
  body: Record<string, unknown>,
  field: SiteStringField,
  payload: SiteMutationPayload
) {
  if (!(field in body)) return null

  const value = body[field]
  if (value === null && field !== 'address') {
    const mutablePayload = payload as Record<SiteStringField, string | null>
    mutablePayload[field] = null
    return null
  }
  if (typeof value !== 'string') return `${field} must be a string.`

  const trimmed = value.trim()
  if (trimmed.length > STRING_FIELDS[field]) return `${field} is too long.`
  if (field === 'address' && !trimmed) return 'address is required.'

  const mutablePayload = payload as Record<SiteStringField, string | null>
  mutablePayload[field] = trimmed
  return null
}

export function validateSitePayload(
  input: unknown,
  mode: 'create' | 'update'
): SitePayloadValidationResult {
  if (!isRecord(input)) {
    return { success: false, error: 'Invalid request body.' }
  }

  const payload: SiteMutationPayload = {}

  if ('clientId' in input) {
    if (typeof input.clientId !== 'string' || !UUID_PATTERN.test(input.clientId.trim())) {
      return { success: false, error: 'clientId is invalid.' }
    }
    payload.clientId = input.clientId.trim()
  }

  for (const field of Object.keys(STRING_FIELDS) as SiteStringField[]) {
    const error = validateStringField(input, field, payload)
    if (error) return { success: false, error }
  }

  if (mode === 'create' && (!('address' in payload) || !payload.address)) {
    return { success: false, error: 'address is required.' }
  }

  if ('city' in input) {
    if (typeof input.city !== 'string' || !CITY_OPTIONS.has(input.city as City)) {
      return { success: false, error: 'city is invalid.' }
    }
    payload.city = input.city as City
  } else if (mode === 'create') {
    return { success: false, error: 'city is required.' }
  }

  if ('premisesType' in input) {
    if (input.premisesType === null) {
      payload.premisesType = null
    } else if (
      typeof input.premisesType !== 'string' ||
      !PREMISES_OPTIONS.has(input.premisesType as PremisesType)
    ) {
      return { success: false, error: 'premisesType is invalid.' }
    } else {
      payload.premisesType = input.premisesType as PremisesType
    }
  }

  if ('floorArea' in input) {
    if (input.floorArea === null) {
      payload.floorArea = null
    } else if (
      typeof input.floorArea !== 'number' ||
      !Number.isFinite(input.floorArea) ||
      input.floorArea < 0 ||
      input.floorArea > MAX_FLOOR_AREA
    ) {
      return { success: false, error: 'floorArea is invalid.' }
    } else {
      payload.floorArea = input.floorArea
    }
  }

  if ('isActive' in input) {
    if (typeof input.isActive !== 'boolean') {
      return { success: false, error: 'isActive must be a boolean.' }
    }
    payload.isActive = input.isActive
  }

  if (mode === 'update') {
    if (typeof input.siteId !== 'string' || !input.siteId.trim()) {
      return { success: false, error: 'siteId is required.' }
    }
    const siteId = input.siteId.trim()
    if (!UUID_PATTERN.test(siteId)) {
      return { success: false, error: 'siteId is invalid.' }
    }
    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'Provide at least one site field to update.' }
    }
    return { success: true, siteId, payload }
  }

  return { success: true, payload }
}
