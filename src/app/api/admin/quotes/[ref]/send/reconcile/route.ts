import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getUnresolvedFinalQuoteSendAttempt, QuoteWorkflowConflictError, reconcileFinalQuoteSend } from '@/lib/quoteWorkflowData'

export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  if (!isAuthorizedAdminRequest(request, 'manager')) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, attempt: await getUnresolvedFinalQuoteSendAttempt(params.ref) })
  } catch (error) {
    console.error('[quote-reconcile] Failed to inspect attempt:', error)
    return NextResponse.json({ success: false, error: 'Delivery status could not be loaded.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  if (!isAuthorizedAdminRequest(request, 'manager')) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : ''
    const resolution = body.resolution === 'confirmed_rejected' || body.resolution === 'confirmed_accepted' ? body.resolution : null
    const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : ''
    const providerMessageId = typeof body.providerMessageId === 'string' ? body.providerMessageId.trim() : undefined
    if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !resolution || evidence.length < 10 || evidence.length > 1000 || (providerMessageId && providerMessageId.length > 200)) {
      return NextResponse.json({ success: false, error: 'Provide a valid attempt, resolution, and external-provider evidence.' }, { status: 400 })
    }
    const result = await reconcileFinalQuoteSend(params.ref, attemptId, resolution, evidence, {
      kind: 'staff_account', id: identity.id, name: identity.username,
    }, providerMessageId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[quote-reconcile] Failed to reconcile attempt:', error)
    if (error instanceof QuoteWorkflowConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    return NextResponse.json({ success: false, error: 'Delivery reconciliation could not be completed.' }, { status: 500 })
  }
}
