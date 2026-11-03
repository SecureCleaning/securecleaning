import { NextRequest } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase'
import { normalizeStaffUsername, verifyStaffPassword } from '@/lib/staffAccounts'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit, rateLimitValue } from '@/lib/abuseProtection'
import { PARTNER_COOKIE, PARTNER_SESSION_SECONDS, createPartnerSession, getPartnerActor, tokenHash } from '@/lib/partnerBookingAuth'
import { companyEnabled, PartnerError } from '@/lib/partnerBookingPolicy'
import { partnerJson, partnerFailure } from '@/lib/partnerBookingHttp'

export async function GET(request: NextRequest) {
  try { const actor = await getPartnerActor(request); return partnerJson({ name: actor.display_name, company: actor.company.name, cities: actor.company.cities }) } catch (error) { return partnerFailure(error) }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 4096) ?? await rateLimit(request, { key: 'partner:login', limit: 10, windowMs: 15 * 60000 })
  if (blocked) return blocked
  try {
    const body = await request.json(), username = normalizeStaffUsername(body.username)
    const limited = await rateLimitValue(username, { key: 'partner:username', limit: 10, windowMs: 15 * 60000 }); if (limited) return limited
    if (!username || typeof body.password !== 'string' || body.password.length > 256) throw new PartnerError('Invalid username or password.', 401)
    const db = getAdminSupabase()
    const { data: user, error } = await db.from('partner_booking_users').select('id, active, company_id, password_hash, session_version').eq('username', username).maybeSingle()
    if (error) throw error
    // Equal-cost password verification for unknown usernames.
    const dummy = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64)
    const valid = verifyStaffPassword(body.password, user?.password_hash ?? dummy)
    if (!valid || !user?.active) throw new PartnerError('Invalid username or password.', 401)
    const { data: company, error: companyError } = await db.from('partner_booking_companies').select('*').eq('id', user.company_id).single()
    if (companyError) throw companyError
    if (!companyEnabled(company)) throw new PartnerError('Your booking access is disabled or has expired.', 403)
    const token = await createPartnerSession(user)
    const response = partnerJson({ success: true })
    response.cookies.set(PARTNER_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: PARTNER_SESSION_SECONDS })
    return response
  } catch (error) { return partnerFailure(error) }
}
export async function DELETE(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request); if (blocked) return blocked
  try {
    const token = request.cookies.get(PARTNER_COOKIE)?.value
    if (token) { const { error } = await getAdminSupabase().from('partner_booking_sessions').delete().eq('token_hash', tokenHash(token)); if (error) throw error }
    const response = partnerJson({ success: true }); response.cookies.set(PARTNER_COOKIE, '', { path: '/', maxAge: 0 }); return response
  } catch (error) { return partnerFailure(error) }
}
