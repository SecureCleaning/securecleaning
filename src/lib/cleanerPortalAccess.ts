import { createHmac, timingSafeEqual } from 'node:crypto'

export const CLEANER_PORTAL_COOKIE = 'sc_cleaner_portal'
const TOKEN_VERSION = 'v1'
const DEFAULT_LIFETIME_SECONDS = 48 * 60 * 60

export type CleanerPortalClaims = {
  mode: 'update' | 'onboarding'
  email: string
  cleanerId?: string
  exp: number
}

function signingSecret() {
  const secret = process.env.CLEANER_PORTAL_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim()
  if (!secret) throw new Error('Cleaner portal signing secret is not configured.')
  return secret
}

function sign(payload: string) {
  return createHmac('sha256', signingSecret()).update(`cleaner-portal:${payload}`).digest('base64url')
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function createCleanerPortalToken(
  input: Omit<CleanerPortalClaims, 'exp'>,
  now = Date.now(),
  lifetimeSeconds = DEFAULT_LIFETIME_SECONDS,
) {
  const claims: CleanerPortalClaims = {
    mode: input.mode,
    email: input.email.trim().toLowerCase(),
    cleanerId: input.mode === 'update' ? input.cleanerId : undefined,
    exp: Math.floor(now / 1000) + lifetimeSeconds,
  }
  if (!validEmail(claims.email) || (claims.mode === 'update' && !claims.cleanerId)) {
    throw new Error('Invalid cleaner portal token claims.')
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${TOKEN_VERSION}.${payload}.${sign(payload)}`
}

export function verifyCleanerPortalToken(token: unknown, now = Date.now()): CleanerPortalClaims | null {
  if (typeof token !== 'string') return null
  const [version, payload, signature, extra] = token.split('.')
  if (version !== TOKEN_VERSION || !payload || !signature || extra) return null

  const supplied = Buffer.from(signature, 'base64url')
  const expected = Buffer.from(sign(payload), 'base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<CleanerPortalClaims>
    const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : ''
    if ((parsed.mode !== 'update' && parsed.mode !== 'onboarding') || !validEmail(email)) return null
    if (!Number.isSafeInteger(parsed.exp) || Number(parsed.exp) < Math.floor(now / 1000)) return null
    if (parsed.mode === 'update' && (typeof parsed.cleanerId !== 'string' || !parsed.cleanerId)) return null
    return { mode: parsed.mode, email, cleanerId: parsed.mode === 'update' ? parsed.cleanerId : undefined, exp: Number(parsed.exp) }
  } catch {
    return null
  }
}
