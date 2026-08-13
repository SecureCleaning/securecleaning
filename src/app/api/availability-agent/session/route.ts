import { NextRequest, NextResponse } from 'next/server'
import {
  AVAILABILITY_AGENT_SESSION_COOKIE,
  AVAILABILITY_AGENT_SESSION_MAX_AGE_SECONDS,
  createAvailabilityAgentSessionToken,
} from '@/lib/availabilityAgentAuth'
import {
  getAvailabilityAssignee,
  getAvailabilityAssigneeByUsername,
  getAvailabilityConfig,
} from '@/lib/availability'
import { verifyAvailabilityAccessCode } from '@/lib/availabilityAccessCode'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const blocked =
      rejectCrossOriginMutation(request) ??
      rejectLargePayload(request, 4 * 1024) ??
      rateLimit(request, { key: 'availability-agent-login:minute', limit: 5, windowMs: 60 * 1000 }) ??
      rateLimit(request, { key: 'availability-agent-login:hour', limit: 20, windowMs: 60 * 60 * 1000 })
    if (blocked) return blocked

    const body = await request.json()
    const assigneeId = typeof body?.assigneeId === 'string' ? body.assigneeId.trim() : ''
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : ''

    if ((!assigneeId && !username) || !accessCode) {
      return NextResponse.json({ success: false, error: 'Username and password are required.' }, { status: 400 })
    }

    const config = await getAvailabilityConfig()
    const assignee =
      getAvailabilityAssignee(config, assigneeId) ??
      getAvailabilityAssigneeByUsername(config, username)

    if (!assignee?.active || !assignee.accessCodeHash || !verifyAvailabilityAccessCode(accessCode, assignee.accessCodeHash)) {
      return NextResponse.json({ success: false, error: 'Invalid username or password.' }, { status: 401 })
    }

    if (!assignee.username) {
      return NextResponse.json({ success: false, error: 'This agent account is not configured yet.' }, { status: 500 })
    }

    const sessionToken = createAvailabilityAgentSessionToken(assignee.id, assignee.accessCodeHash)
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'Agent access is not configured.' }, { status: 500 })
    }

    const response = NextResponse.json({ success: true, assigneeId: assignee.id, username: assignee.username })
    response.cookies.set({
      name: AVAILABILITY_AGENT_SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: AVAILABILITY_AGENT_SESSION_MAX_AGE_SECONDS,
    })

    return response
  } catch (error) {
    console.error('[api/availability-agent/session] Failed to create session:', error)
    return NextResponse.json({ success: false, error: 'Failed to create session.' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: AVAILABILITY_AGENT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
