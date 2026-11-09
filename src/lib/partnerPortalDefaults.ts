import type { City } from './types'

export function defaultPartnerCity(cities: readonly City[]): City | '' {
  return cities.includes('sydney') ? 'sydney' : cities[0] || ''
}
