import { australianLocalities } from '@/lib/australianLocalities'
import type { CrmServiceRegion } from '@/lib/clientCrmAssignment'

export function crmPostcodeMatchesRegion(postcode: string, city: CrmServiceRegion) {
  const matches = australianLocalities.filter((locality) => locality.postcode === postcode)
  // Keep manual entry available for new postcodes not yet in the catalogue.
  return !matches.length || matches.some((locality) => locality.state === (city === 'sydney' ? 'NSW' : 'VIC'))
}
