import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getAdminSupabase } from './supabase'
import { companyEnabled, PartnerError, type PartnerCompany } from './partnerBookingPolicy'

export const PARTNER_COOKIE = 'securecleaning_partner_session'
export const PARTNER_SESSION_SECONDS = 8 * 60 * 60
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export type PartnerActor = { id: string; display_name: string; session_version: string; company: PartnerCompany }
export async function getPartnerActor(request: NextRequest): Promise<PartnerActor> {
  const token = request.cookies.get(PARTNER_COOKIE)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PartnerError('Please sign in.', 401)
  const db = getAdminSupabase()
  const { data: session, error } = await db.from('partner_booking_sessions').select('user_id, session_version, expires_at').eq('token_hash', tokenHash(token)).maybeSingle()
  if (error) throw error
  if (!session || Date.parse(session.expires_at) <= Date.now()) throw new PartnerError('Please sign in again.', 401)
  const { data: user, error: userError } = await db.from('partner_booking_users').select('id, display_name, active, company_id, session_version').eq('id', session.user_id).maybeSingle()
  if (userError) throw userError
  if (!user?.active || user.session_version !== session.session_version) throw new PartnerError('Please sign in again.', 401)
  const { data: company, error: companyError } = await db.from('partner_booking_companies').select('id, name, active, cities, assignee_ids, expires_at').eq('id', user.company_id).maybeSingle()
  if (companyError) throw companyError
  if (!company || !companyEnabled(company)) throw new PartnerError('Your booking access is disabled or has expired.', 403)
  return { id: user.id, display_name: user.display_name, session_version: user.session_version, company }
}
export async function createPartnerSession(user: { id: string; session_version: string }) {
  const token = randomBytes(32).toString('hex')
  const { error } = await getAdminSupabase().from('partner_booking_sessions').insert({ token_hash: tokenHash(token), user_id: user.id, session_version: user.session_version, expires_at: new Date(Date.now() + PARTNER_SESSION_SECONDS * 1000).toISOString() })
  if (error) throw error
  return token
}
