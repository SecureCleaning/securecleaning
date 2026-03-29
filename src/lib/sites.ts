import { getAdminSupabase } from '@/lib/supabase'
import type { City, PremisesType } from '@/lib/types'

export interface SiteRecord {
  id: string
  client_id?: string | null
  site_name?: string | null
  address: string
  suburb?: string | null
  postcode?: string | null
  city: City
  premises_type?: PremisesType | null
  floor_area?: number | null
  access_notes?: string | null
  alarm_notes?: string | null
  induction_notes?: string | null
  keyholder_name?: string | null
  keyholder_phone?: string | null
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface SitePayload {
  clientId?: string | null
  siteName?: string | null
  address: string
  suburb?: string | null
  postcode?: string | null
  city: City
  premisesType?: PremisesType | null
  floorArea?: number | null
  accessNotes?: string | null
  alarmNotes?: string | null
  inductionNotes?: string | null
  keyholderName?: string | null
  keyholderPhone?: string | null
  isActive?: boolean
}

export async function getSites() {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('sites')
    .select('id, client_id, site_name, address, suburb, postcode, city, premises_type, floor_area, access_notes, alarm_notes, induction_notes, keyholder_name, keyholder_phone, is_active, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[sites] Failed to load sites:', error)
    return [] as SiteRecord[]
  }

  return (data ?? []) as SiteRecord[]
}

export async function createSite(payload: SitePayload) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('sites')
    .insert({
      client_id: payload.clientId ?? null,
      site_name: payload.siteName ?? null,
      address: payload.address,
      suburb: payload.suburb ?? null,
      postcode: payload.postcode ?? null,
      city: payload.city,
      premises_type: payload.premisesType ?? null,
      floor_area: payload.floorArea ?? null,
      access_notes: payload.accessNotes ?? null,
      alarm_notes: payload.alarmNotes ?? null,
      induction_notes: payload.inductionNotes ?? null,
      keyholder_name: payload.keyholderName ?? null,
      keyholder_phone: payload.keyholderPhone ?? null,
      is_active: payload.isActive ?? true,
    })
    .select('id, client_id, site_name, address, suburb, postcode, city, premises_type, floor_area, access_notes, alarm_notes, induction_notes, keyholder_name, keyholder_phone, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data as SiteRecord
}

export async function updateSite(siteId: string, payload: Partial<SitePayload>) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('sites')
    .update({
      client_id: payload.clientId,
      site_name: payload.siteName,
      address: payload.address,
      suburb: payload.suburb,
      postcode: payload.postcode,
      city: payload.city,
      premises_type: payload.premisesType,
      floor_area: payload.floorArea,
      access_notes: payload.accessNotes,
      alarm_notes: payload.alarmNotes,
      induction_notes: payload.inductionNotes,
      keyholder_name: payload.keyholderName,
      keyholder_phone: payload.keyholderPhone,
      is_active: payload.isActive,
    })
    .eq('id', siteId)
    .select('id, client_id, site_name, address, suburb, postcode, city, premises_type, floor_area, access_notes, alarm_notes, induction_notes, keyholder_name, keyholder_phone, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data as SiteRecord
}
