import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, isValidAdminPassword } from '@/lib/adminAuth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!isValidAdminPassword(password)) {
      return NextResponse.json({ success: false, error: 'Invalid password.' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: password,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
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
