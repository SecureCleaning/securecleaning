import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'securecleaning_admin_session'

function getExpectedPassword() {
  return (process.env.CONTENT_ADMIN_PASSWORD ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isValidAdminPassword(password: string | null | undefined) {
  const expectedPassword = getExpectedPassword()
  const candidate = normalize(password)
  return Boolean(expectedPassword && candidate && candidate === expectedPassword)
}

export function isAuthorizedAdminRequest(request: NextRequest) {
  const headerPassword = request.headers.get('x-admin-password')
  const cookiePassword = request.cookies.get(ADMIN_SESSION_COOKIE)?.value

  return isValidAdminPassword(headerPassword) || isValidAdminPassword(cookiePassword)
}

export async function hasAdminSession() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ADMIN_SESSION_COOKIE)

  if (!cookieValue?.value) {
    return false
  }

  return isValidAdminPassword(cookieValue.value)
}
