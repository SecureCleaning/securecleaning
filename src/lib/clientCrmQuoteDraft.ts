import type { BookingInputs, CleaningFrequency, PremisesType, QuoteInputs, TimePreference } from '@/lib/types'

const PREMISES_TYPES: PremisesType[] = [
  'office', 'medical', 'industrial', 'childcare', 'retail', 'gym', 'warehouse',
  'function_centre', 'sports_facility', 'other',
]
const CLEANING_FREQUENCIES: CleaningFrequency[] = ['daily', '3x_week', '2x_week', 'weekly', 'fortnightly']
const TIME_PREFERENCES: TimePreference[] = ['business_hours', 'after_hours', 'weekend']

function valueFromList<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function positiveNumber(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

export function buildCrmQuoteDraftInputs(input: {
  businessName: string
  contactName: string
  email: string
  phone: string
  address: string
  suburb: string
  postcode: string
  city: 'melbourne' | 'sydney'
  bookingInputs?: Partial<BookingInputs> | null
}): QuoteInputs {
  const booking = input.bookingInputs ?? {}
  return {
    businessName: input.businessName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    address: input.address,
    suburb: input.suburb,
    postcode: input.postcode,
    city: input.city,
    premisesType: valueFromList(booking.premisesType, PREMISES_TYPES, 'office'),
    floorArea: positiveNumber(booking.floorArea, 100),
    floors: 1,
    flooringType: 'mixed',
    frequency: valueFromList(booking.frequency, CLEANING_FREQUENCIES, 'weekly'),
    timePreference: valueFromList(booking.timePreference, TIME_PREFERENCES, 'business_hours'),
    isSpringClean: false,
    roomScope: [],
    addOns: {
      bathrooms: 0,
      kitchens: 0,
      windows: 0,
      consumables: false,
      highTouchDisinfection: false,
      carpetSteam: false,
    },
    preferredStartDate: typeof booking.preferredStartDate === 'string' ? booking.preferredStartDate : undefined,
  }
}
