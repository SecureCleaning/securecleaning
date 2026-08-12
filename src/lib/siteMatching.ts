import { getAdminSupabase } from '@/lib/supabase'
import type { BookingInputs } from '@/lib/types'

function normalize(value: string | undefined | null) {
  return (value ?? '').trim().toLowerCase()
}

export async function findMatchingSiteForBooking(inputs: BookingInputs, clientId?: string | null) {
  const db = getAdminSupabase()
  const address = normalize(inputs.address)
  const suburb = normalize(inputs.suburb)
  const postcode = normalize(inputs.postcode)
  if (!address) return null

  let query = db
    .from('sites')
    .select('id, client_id, address, suburb, postcode, city')
    .eq('city', inputs.city)
    .limit(20)

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[siteMatching] Failed to load candidate sites:', error)
    return null
  }

  const exactMatch = (data ?? []).find((site) => {
    if (normalize(site.address) !== address) return false
    if (suburb && normalize(site.suburb) && normalize(site.suburb) !== suburb) return false
    if (postcode && normalize(site.postcode) && normalize(site.postcode) !== postcode) return false
    return true
  })
  return exactMatch ?? null
}

export async function createSiteFromBooking(inputs: BookingInputs, clientId?: string | null): Promise<{ id: string; client_id: string | null; address: string; suburb: string | null; postcode: string | null; city: string }> {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('sites')
    .insert({
      client_id: clientId ?? null,
      site_name: inputs.businessName?.trim() || `${inputs.contactName?.trim() || 'Customer'} site`,
      address: inputs.address,
      suburb: inputs.suburb ?? null,
      postcode: inputs.postcode ?? null,
      city: inputs.city,
      premises_type: inputs.premisesType,
      floor_area: inputs.floorArea,
      access_notes: inputs.notes ?? null,
      is_active: true,
    })
    .select('id, client_id, address, suburb, postcode, city')
    .single()

  if (error) throw error
  return data
}
