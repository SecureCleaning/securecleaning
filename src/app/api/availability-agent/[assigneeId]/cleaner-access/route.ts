import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { sendCleanerPortalLink } from '@/lib/cleanerPortal'

export async function POST(request: NextRequest, { params }: { params: { assigneeId: string } }) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-access:${context.assignee.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const mode = body?.mode === 'onboarding' ? 'onboarding' : body?.mode === 'update' ? 'update' : null
    if (!mode) throw new Error('Select an invitation type.')
    const sent = await sendCleanerPortalLink(email, mode, { state: context.state })
    if (!sent) throw new Error(`No cleaner record matches that email address in ${context.state}.`)
    return NextResponse.json({ success: true, message: mode === 'onboarding' ? `${context.state} registration invitation sent.` : `${context.state} cleaner update link sent.` })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to send cleaner access link.' }, { status: 400 })
  }
}
