import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'securecleaning_admin_session'
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12
const ADMIN_SESSION_VERSION = 1

function getExpectedPassword() {
  return (process.env.CONTENT_ADMIN_PASSWORD ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function getAdminSessionSecret() {
  const expectedPassword = getExpectedPassword()
  return expectedPassword ? `securecleaning-admin-session:${expectedPassword}` : ''
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

export function createAdminSessionToken() {
  const secret = getAdminSessionSecret()
  if (!secret) {
    return null
  }

  const payload = Buffer.from(
    JSON.stringify({
      v: ADMIN_SESSION_VERSION,
      exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS,
    })
  ).toString('base64url')

  const signature = signAdminSessionPayload(payload)
  if (!signature) {
    return null
  }

  return `${payload}.${signature}`
}

export function isValidAdminSessionToken(token: string | null | undefined) {
  const candidate = normalize(token)
  if (!candidate) {
    return false
  }

  const [payload, signature] = candidate.split('.')
  if (!payload || !signature) {
    return false
  }

  const expectedSignature = signAdminSessionPayload(payload)
  if (!expectedSignature || expectedSignature.length !== signature.length) {
    return false
  }

  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return false
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: number
      exp?: number
    }

    if (parsed.v !== ADMIN_SESSION_VERSION) {
      return false
    }

    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export function isAuthorizedAdminRequest(request: NextRequest) {
  const headerPassword = request.headers.get('x-admin-password')
  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value

  return isValidAdminPassword(headerPassword) || isValidAdminSessionToken(sessionToken)
}

export async function hasAdminSession() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ADMIN_SESSION_COOKIE)

  if (!cookieValue?.value) {
    return false
  }

  return isValidAdminSessionToken(cookieValue.value)
}
