import type { City } from '@/lib/types'

export function normalizeAvailabilityAssigneeCity(value: unknown, fallbackCity: City): { city: City; supported: boolean } {
  if (value === 'melbourne' || value === 'sydney') return { city: value, supported: true }
  if (value === undefined || value === null || value === '') return { city: fallbackCity, supported: true }
  return { city: fallbackCity, supported: false }
}
