import type { CleanerPayload } from '@/lib/cleaners'

export const AUSTRALIAN_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] as const
export const CLEANER_PORTAL_SERVICES = ['Office cleaning', 'Medical cleaning', 'Childcare cleaning', 'Retail cleaning', 'Gym cleaning', 'Industrial cleaning', 'Warehouse cleaning', 'Event venue cleaning'] as const

export type CleanerPortalProfile = {
  businessName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  alternatePhone: string
  address: string
  suburb: string
  postcode: string
  city: string
  state: string
  abn: string
  services: string[]
  serviceAreas: string[]
  preferredWork: string
  insuranceExpiry: string
  policeCheckExpiry: string
  inductionExpiry: string
  workingWithChildrenCheck: boolean
  status: string
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function list(value: unknown, maxItems = 30) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => clean(item, 80)).filter(Boolean))).slice(0, maxItems)
}

function date(value: unknown) {
  const candidate = clean(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

export function sanitizeCleanerPortalPayload(candidate: unknown, registeredEmail: string): CleanerPayload {
  const body = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {}
  const firstName = clean(body.firstName, 80)
  const lastName = clean(body.lastName, 80)
  const businessName = clean(body.businessName, 160)
  const state = clean(body.state, 8).toUpperCase()
  if (!businessName || !firstName || !lastName) throw new Error('Business name, first name and surname are required.')
  if (!AUSTRALIAN_STATES.includes(state as typeof AUSTRALIAN_STATES[number])) throw new Error('Select a valid state or territory.')

  return {
    businessName,
    firstName,
    lastName,
    contactName: `${firstName} ${lastName}`,
    email: registeredEmail.trim().toLowerCase(),
    phone: clean(body.phone, 40),
    alternatePhone: clean(body.alternatePhone, 40),
    address: clean(body.address, 240),
    suburb: clean(body.suburb, 80),
    postcode: clean(body.postcode, 12),
    city: clean(body.city, 40),
    state,
    abn: clean(body.abn, 40),
    services: list(body.services),
    serviceAreas: list(body.serviceAreas),
    preferredWork: clean(body.preferredWork, 800),
    insuranceExpiry: date(body.insuranceExpiry),
    policeCheckExpiry: date(body.policeCheckExpiry),
    inductionExpiry: date(body.inductionExpiry),
    workingWithChildrenCheck: body.workingWithChildrenCheck === true,
  }
}
