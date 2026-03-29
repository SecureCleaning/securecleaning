import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'securecleaning_admin_session'

function getExpectedPassword() {
  return process.env.CONTENT_ADMIN_PASSWORD ?? ''
}

export function isValidAdminPassword(password: string | null | undefined) {
  const expectedPassword = getExpectedPassword()
  return Boolean(expectedPassword && password && password === expectedPassword)
}

export function isAuthorizedAdminRequest(request: NextRequest) {
  const headerPassword = request.headers.get('x-admin-password')
  const cookiePassword = request.cookies.get(ADMIN_SESSION_COOKIE)?.value

  return isValidAdminPassword(headerPassword) || isValidAdminPassword(cookiePassword)
}

export async function hasAdminSession() {
  const cookieStore = await cookies()
  const cookiePassword = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  return isValidAdminPassword(cookiePassword)
}
