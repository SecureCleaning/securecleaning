import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { isAuthorizedAdminRequest, getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getAdminSupabase } from '@/lib/supabase'
import { hashStaffPassword, normalizeStaffUsername } from '@/lib/staffAccounts'
import { loadPartnerConfig } from '@/lib/partnerBookingAvailability'
import { PARTNER_REGIONS, PartnerError, textField } from '@/lib/partnerBookingPolicy'
import { partnerJson, partnerFailure } from '@/lib/partnerBookingHttp'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { writeAuditLogStrict } from '@/lib/auditLog'

export async function GET(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request, 'owner')) return partnerJson({ error: 'Owner access required.' }, 403)
  try {
    const db = getAdminSupabase()
    const [companies, users, activity, { config }, cleanerIntakes] = await Promise.all([
      db.from('partner_booking_companies').select('*').order('name'),
      db.from('partner_booking_users').select('id, company_id, username, display_name, active').order('display_name'),
      db.from('partner_booking_requests').select('id, contact_review_required, company_id, user_id, booking_id, created_at, email_status, calendar_status, bookings!partner_booking_requests_booking_id_fkey(booking_ref, inputs, inspection_scheduled_for, opportunity_id)').order('created_at', { ascending: false }).limit(100),
      loadPartnerConfig(),
      db.from('partner_cleaner_intakes').select('id, company_id, user_id, created_at, created_cleaner, email_status, review_reason, inputs').order('created_at', { ascending: false }).limit(100),
    ])
    if (companies.error || users.error || activity.error || cleanerIntakes.error) throw companies.error || users.error || activity.error || cleanerIntakes.error
    return partnerJson({ companies: companies.data, users: users.data, activity: activity.data, cleanerIntakes: cleanerIntakes.data, calendars: config.assignees.map(a => ({ id: a.id, name: a.name, city: a.city, active: a.active })) })
  } catch (error) { return partnerFailure(error) }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 16000); if (blocked) return blocked
  if (!await isAuthorizedAdminRequest(request, 'owner')) return partnerJson({ error: 'Owner access required.' }, 403)
  try {
    const body = await request.json(), db = getAdminSupabase(), actor = await getAdminSessionIdentityFromRequest(request)
    const id = body.id ? textField(body.id, 'record', 36) : randomUUID()
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PartnerError('Invalid record.')
    if (body.kind === 'company') {
      const name = textField(body.name, 'company name', 120)
      const { config } = await loadPartnerConfig()
      if (!Array.isArray(body.cities) || body.cities.some((c: string) => !Object.hasOwn(PARTNER_REGIONS, c)) || !Array.isArray(body.assignee_ids) || body.assignee_ids.length > 100 || body.assignee_ids.some((id: string) => !config.assignees.some(a => a.id === id))) throw new PartnerError('Choose valid states and calendars.')
      const expires = body.expires_at ? new Date(body.expires_at) : null
      if (expires && !Number.isFinite(expires.getTime())) throw new PartnerError('Choose a valid expiry date.')
      const row = { id, name, active: body.active === true, cities: [...new Set(body.cities)], assignee_ids: [...new Set(body.assignee_ids)], expires_at: expires?.toISOString() ?? null, updated_at: new Date().toISOString() }
      await writeAuditLogStrict('partner_company', id, 'partner.access.change_requested', { actorId: actor?.id, ...row })
      const { error } = body.id ? await db.from('partner_booking_companies').update(row).eq('id', id) : await db.from('partner_booking_companies').insert(row)
      if (error) throw error
    } else if (body.kind === 'user') {
      const username = normalizeStaffUsername(body.username), displayName = textField(body.display_name, 'caller name', 120)
      if (!username || username !== body.username) throw new PartnerError('Use lowercase letters, numbers, dots, underscores or hyphens for the username.')
      const companyId = textField(body.company_id, 'company', 36)
      const password = typeof body.password === 'string' ? body.password : ''
      if ((!body.id || password) && (password.length < 12 || password.length > 256)) throw new PartnerError('Use a password of 12 to 256 characters.')
      const row = { id, username, display_name: displayName, company_id: companyId, active: body.active === true, session_version: randomUUID(), updated_at: new Date().toISOString(), ...(password ? { password_hash: hashStaffPassword(password) } : {}) }
      await writeAuditLogStrict('partner_user', id, 'partner.user.change_requested', { actorId: actor?.id, username, companyId, active: row.active, passwordReset: Boolean(password) })
      const { error } = body.id ? await db.from('partner_booking_users').update(row).eq('id', id) : await db.from('partner_booking_users').insert(row)
      if (error?.code === '23505') throw new PartnerError('That username is already in use.')
      if (error) throw error
    } else throw new PartnerError('Invalid action.')
    return partnerJson({ success: true })
  } catch (error) { return partnerFailure(error) }
}
