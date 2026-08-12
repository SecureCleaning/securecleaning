import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  isValidAdminPassword,
} from '@/lib/adminAuth'
import {
  countStaffAccounts,
  createStaffAccount,
  getStaffAccountForLogin,
  normalizeStaffUsername,
  recordStaffLogin,
  verifyStaffPassword,
} from '@/lib/staffAccounts'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const blocked =
      rejectCrossOriginMutation(request) ??
      rejectLargePayload(request, 4 * 1024) ??
      rateLimit(request, { key: 'admin-login:minute', limit: 5, windowMs: 60 * 1000 }) ??
      rateLimit(request, { key: 'admin-login:hour', limit: 20, windowMs: 60 * 60 * 1000 })
    if (blocked) return blocked

    const body = await request.json()
    const username = normalizeStaffUsername(body?.username)
    const password = typeof body?.password === 'string' ? body.password : ''
    let account = null

    if (await countStaffAccounts() === 0) {
      if (!isValidAdminPassword(password)) {
        return NextResponse.json({ success: false, error: 'Invalid username or password.' }, { status: 401 })
      }

      account = await createStaffAccount({
        username: username || 'owner',
        displayName: username || 'Secure Cleaning Owner',
        role: 'owner',
        password,
      })
    } else {
      const storedAccount = username ? await getStaffAccountForLogin(username) : null
      if (!storedAccount || !storedAccount.active || !verifyStaffPassword(password, storedAccount.password_hash)) {
        return NextResponse.json({ success: false, error: 'Invalid username or password.' }, { status: 401 })
      }
      account = {
        id: storedAccount.id,
        username: storedAccount.username,
        role: storedAccount.role,
      }
      await recordStaffLogin(storedAccount.id)
    }

    const sessionToken = createAdminSessionToken({
      id: account.id,
      username: account.username,
      role: account.role,
    })
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'Admin auth is not configured.' }, { status: 500 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    })

    return response
  } catch (error) {
    console.error('[api/admin/session] Failed to create session:', error)
    return NextResponse.json({ success: false, error: 'Failed to create session.' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
