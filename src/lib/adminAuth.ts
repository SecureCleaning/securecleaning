import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { getStaffAccountById, type AdminRole } from '@/lib/staffAccounts'

export const ADMIN_SESSION_COOKIE = 'securecleaning_admin_session'
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12
const ADMIN_SESSION_VERSION = 3

function getExpectedPassword() {
  return (process.env.CONTENT_ADMIN_PASSWORD ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function getAdminSessionSecret() {
  return (process.env.ADMIN_SESSION_SECRET ?? '').trim()
}

function signAdminSessionPayload(payload: string) {
  const secret = getAdminSessionSecret()
  if (!secret) return ''

  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function isValidAdminPassword(password: string | null | undefined) {
  const expectedPassword = getExpectedPassword()
  const candidate = normalize(password)
  return Boolean(expectedPassword && candidate && candidate === expectedPassword)
}

export type AdminSessionIdentity = {
  id: string
  username: string
  role: AdminRole
}

function accountRevision(account: NonNullable<Awaited<ReturnType<typeof getStaffAccountById>>>) {
  return createHmac('sha256', getAdminSessionSecret()).update(JSON.stringify([
    account.session_version, account.username, account.password_hash, account.legacy_password_hash, account.role,
    account.active, account.availability_assignee_id,
  ])).digest('base64url')
}

export async function createAdminSessionToken(identity: AdminSessionIdentity) {
  const secret = getAdminSessionSecret()
  if (!secret) {
    return null
  }

  const account = await getStaffAccountById(identity.id)
  if (!account?.active || account.role !== identity.role) return null
  const payload = Buffer.from(
    JSON.stringify({
      v: ADMIN_SESSION_VERSION,
      rev: accountRevision(account),
      sub: identity.id,
      username: identity.username,
      role: identity.role,
      exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS,
    })
  ).toString('base64url')

  const signature = signAdminSessionPayload(payload)
  if (!signature) {
    return null
  }

  return `${payload}.${signature}`
}

export async function isValidAdminSessionToken(token: string | null | undefined) {
  return Boolean(await getAdminSessionIdentity(token))
}

export async function getAdminSessionIdentity(token: string | null | undefined): Promise<AdminSessionIdentity | null> {
  const candidate = normalize(token)
  if (!candidate || candidate.split('.').length !== 2) {
    return null
  }

  const [payload, signature] = candidate.split('.')
  if (!payload || !signature) {
    return null
  }

  const expectedSignature = signAdminSessionPayload(payload)
  if (!expectedSignature || expectedSignature.length !== signature.length) {
    return null
  }

  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      rev?: string
      v?: number
      sub?: string
      username?: string
      role?: AdminRole
      exp?: number
    }

    if (parsed.v !== ADMIN_SESSION_VERSION) return null

    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof parsed.sub !== 'string' || typeof parsed.username !== 'string') return null
    if (parsed.role !== 'owner' && parsed.role !== 'manager' && parsed.role !== 'staff' && parsed.role !== 'agent' && parsed.role !== 'viewer') return null

    const account = await getStaffAccountById(parsed.sub)
    if (!account?.active || parsed.rev !== accountRevision(account)) return null
    return { id: account.id, username: account.username, role: account.role }
  } catch {
    return null
  }
}

const ROLE_LEVEL: Record<AdminRole, number> = { viewer: 0, agent: 1, staff: 2, manager: 3, owner: 4 }

export async function isAuthorizedAdminRequest(request: NextRequest, requiredRole?: AdminRole) {
  const identity = await getAdminSessionIdentityFromRequest(request)
  if (!identity) return false

  // Agents use the regional availability portal, not the general admin APIs.
  // Their regional access is checked by availabilityAgentAuth instead.
  if (identity.role === 'agent') return requiredRole === 'agent'

  const minimumRole = requiredRole ?? (request.method === 'GET' ? 'viewer' : 'staff')
  return ROLE_LEVEL[identity.role] >= ROLE_LEVEL[minimumRole]
}

export async function getAdminSessionIdentityFromRequest(request: NextRequest) {
  return getAdminSessionIdentity(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
}

export function hasAdminRole(role: AdminRole, requiredRole: AdminRole) {
  if (role === 'agent') return requiredRole === 'agent'
  return ROLE_LEVEL[role] >= ROLE_LEVEL[requiredRole]
}

export async function hasAdminSession() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ADMIN_SESSION_COOKIE)

  if (!cookieValue?.value) {
    return false
  }

  return Boolean(await getAdminSessionIdentity(cookieValue.value))
}

export async function getAdminSessionIdentityFromCookies() {
  const cookieStore = await cookies()
  return getAdminSessionIdentity(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
}
