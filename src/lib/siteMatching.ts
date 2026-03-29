import { getAdminSupabase } from '@/lib/supabase'
import type { BookingInputs } from '@/lib/types'

function normalize(value: string | undefined | null) {
  return (value ?? '').trim().toLowerCase()
}

export async function findMatchingSiteForBooking(inputs: BookingInputs, clientId?: string | null) {
  const db = getAdminSupabase()
  const address = normalize(inputs.address)
  if (!address) return null

  let query = db
    .from('sites')
    .select('id, client_id, address, city')
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

  const exactMatch = (data ?? []).find((site) => normalize(site.address) === address)
  return exactMatch ?? null
}

export async function createSiteFromBooking(inputs: BookingInputs, clientId?: string | null): Promise<{ id: string; client_id: string | null; address: string; city: string }> {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('sites')
    .insert({
      client_id: clientId ?? null,
      site_name: inputs.businessName,
      address: inputs.address,
      city: inputs.city,
      premises_type: inputs.premisesType,
      floor_area: inputs.floorArea,
      access_notes: inputs.notes ?? null,
      is_active: true,
    })
    .select('id, client_id, address, city')
    .single()

  if (error) throw error
  return data
}
