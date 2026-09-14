import { getAdminSupabase } from '@/lib/supabase'
import { createCleaner, updateCleaner, uploadCleanerDocument, type CleanerAuditActor } from '@/lib/cleaners'
import { sendEmailOrThrow } from '@/lib/email'
import { getAvailabilityConfig } from '@/lib/availability'
import { listStaffAccounts } from '@/lib/staffAccounts'
import { getSiteUrl } from '@/lib/siteUrl'
import { createCleanerPortalToken, type CleanerPortalClaims } from '@/lib/cleanerPortalAccess'
import { sanitizeCleanerPortalPayload, type CleanerPortalProfile } from '@/lib/cleanerPortalPolicy'

const PORTAL_SELECT = 'id, business_name, first_name, last_name, contact_name, email, phone, alternate_phone, address, suburb, postcode, city, state, abn, status, services, service_areas, preferred_work, insurance_expiry, police_check_expiry, induction_expiry, working_with_children_check'

function toProfile(row: Record<string, unknown>): CleanerPortalProfile {
  return {
    businessName: String(row.business_name ?? ''), firstName: String(row.first_name ?? ''), lastName: String(row.last_name ?? ''),
    email: String(row.email ?? ''), phone: String(row.phone ?? ''), alternatePhone: String(row.alternate_phone ?? ''),
    address: String(row.address ?? ''), suburb: String(row.suburb ?? ''), postcode: String(row.postcode ?? ''), city: String(row.city ?? ''),
    state: String(row.state ?? ''), abn: String(row.abn ?? ''), services: Array.isArray(row.services) ? row.services.map(String) : [],
    serviceAreas: Array.isArray(row.service_areas) ? row.service_areas.map(String) : [], preferredWork: String(row.preferred_work ?? ''),
    insuranceExpiry: String(row.insurance_expiry ?? ''), policeCheckExpiry: String(row.police_check_expiry ?? ''), inductionExpiry: String(row.induction_expiry ?? ''),
    workingWithChildrenCheck: row.working_with_children_check === true, status: String(row.status ?? ''),
  }
}

export async function findCleanerPortalRecordByEmail(email: string) {
  const { data, error } = await getAdminSupabase().from('cleaners').select(PORTAL_SELECT).eq('email', email.trim().toLowerCase()).maybeSingle()
  if (error) throw error
  return data ? { id: String(data.id), profile: toProfile(data as Record<string, unknown>) } : null
}

export async function getCleanerPortalProfile(claims: CleanerPortalClaims) {
  if (claims.mode !== 'update' || !claims.cleanerId) return null
  const { data, error } = await getAdminSupabase().from('cleaners').select(PORTAL_SELECT)
    .eq('id', claims.cleanerId).eq('email', claims.email).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Cleaner access is no longer valid.')
  return toProfile(data as Record<string, unknown>)
}

function portalActor(claims: CleanerPortalClaims, cleanerId?: string): CleanerAuditActor {
  return { id: cleanerId ?? claims.email, username: claims.email, role: 'cleaner_portal' }
}

async function reviewRecipients(state: string) {
  const [staff, availability] = await Promise.all([listStaffAccounts(), getAvailabilityConfig()])
  const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const ownerEmails = staff.filter((item) => item.active && item.role === 'owner').map((item) => item.email.trim().toLowerCase()).filter(validEmail)
  const city = state === 'NSW' ? 'sydney' : state === 'VIC' ? 'melbourne' : null
  const agents = city ? availability.assignees.filter((item) => item.active && item.city === city && validEmail(item.email?.trim().toLowerCase() ?? '')) : []
  if (ownerEmails.length === 0) throw new Error('No active owner is configured to review cleaner registrations.')
  if (agents.length === 0) throw new Error(`No active ${state} agent is configured to review cleaner registrations.`)
  const siteUrl = getSiteUrl()
  return [
    ...ownerEmails.map((email) => ({ email, reviewUrl: `${siteUrl}/admin/cleaners` })),
    ...agents.map((agent) => ({ email: agent.email!.trim().toLowerCase(), reviewUrl: `${siteUrl}/availability/cleaners/${encodeURIComponent(agent.id)}` })),
  ]
}

export async function saveCleanerPortalProfile(claims: CleanerPortalClaims, candidate: unknown) {
  const regionLockedCandidate = claims.mode === 'onboarding' && claims.state && candidate && typeof candidate === 'object'
    ? { ...(candidate as Record<string, unknown>), state: claims.state }
    : candidate
  const payload = sanitizeCleanerPortalPayload(regionLockedCandidate, claims.email)
  if (claims.mode === 'update' && claims.cleanerId) {
    await getCleanerPortalProfile(claims)
    const cleaner = await updateCleaner(claims.cleanerId, payload, portalActor(claims, claims.cleanerId))
    return { cleanerId: cleaner.id, profile: toProfile(cleaner as unknown as Record<string, unknown>), created: false }
  }

  if (await findCleanerPortalRecordByEmail(claims.email)) throw new Error('A cleaner record already exists for this email address.')
  const recipients = await reviewRecipients(payload.state ?? '')
  const cleaner = await createCleaner({ ...payload, status: 'pending_approval', complianceStatus: 'not_checked' }, portalActor(claims))
  await Promise.all(recipients.map((recipient) => sendEmailOrThrow({
    from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', to: recipient.email,
    replyTo: claims.email,
    subject: `Cleaner registration awaiting approval — ${payload.businessName}`,
    html: `<p>A new cleaner registration is awaiting approval.</p><p><strong>${payload.businessName}</strong><br>${payload.contactName}<br>${payload.state}</p><p><a href="${recipient.reviewUrl}">Review cleaner record</a></p><p>The cleaner cannot receive contract offers until an agent or owner changes the status to approved.</p>`,
  })))
  return { cleanerId: cleaner.id, profile: toProfile(cleaner as unknown as Record<string, unknown>), created: true }
}

export async function uploadCleanerPortalDocument(claims: CleanerPortalClaims, input: Omit<Parameters<typeof uploadCleanerDocument>[0], 'cleanerId' | 'actor'>) {
  if (claims.mode !== 'update' || !claims.cleanerId) throw new Error('Save your registration before uploading documents.')
  await getCleanerPortalProfile(claims)
  return uploadCleanerDocument({ ...input, cleanerId: claims.cleanerId, actor: portalActor(claims, claims.cleanerId) })
}

export async function sendCleanerPortalLink(email: string, mode: 'update' | 'onboarding', options?: { state?: string }) {
  const normalizedEmail = email.trim().toLowerCase()
  const requiredState = options?.state?.trim().toUpperCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.')
  const existing = await findCleanerPortalRecordByEmail(normalizedEmail)
  if (mode === 'update' && !existing) return false
  if (mode === 'update' && requiredState && existing?.profile.state !== requiredState) return false
  if (mode === 'onboarding' && existing) throw new Error('A cleaner record already exists for this email address. Send an update link instead.')
  const token = createCleanerPortalToken({ mode, email: normalizedEmail, cleanerId: existing?.id, state: mode === 'onboarding' ? requiredState : undefined })
  const link = `${getSiteUrl()}/cleaners/portal/claim?token=${encodeURIComponent(token)}`
  await sendEmailOrThrow({
    from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', to: normalizedEmail,
    replyTo: process.env.ADMIN_EMAIL ?? 'info@securecleaning.com.au',
    subject: mode === 'onboarding' ? 'Complete your Secure Cleaning registration' : 'Update your Secure Cleaning details',
    html: `<p>Use the secure link below to ${mode === 'onboarding' ? 'complete your cleaner registration' : 'review and update your cleaner details'}.</p><p><a href="${link}">Open cleaner portal</a></p><p>This link expires in 48 hours. If you did not request it, you can ignore this email.</p>`,
  })
  return true
}
