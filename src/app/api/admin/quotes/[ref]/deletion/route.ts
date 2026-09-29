import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import {
  deleteQuoteByRef,
  getQuoteDeletionPreview,
  QuoteDeletionBlockedError,
  QuoteDeletionAuthorizationError,
  QuoteDeletionNotFoundError,
} from '@/lib/quoteDeletion'

function errorResponse(error: unknown) {
  if (error instanceof QuoteDeletionAuthorizationError) return NextResponse.json({ success: false, error: error.message }, { status: 403 })
  if (error instanceof QuoteDeletionNotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 })
  }
  if (error instanceof QuoteDeletionBlockedError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 409 })
  }
  if (error instanceof Error && (
    error.message === 'Review the deletion options before confirming.'
    || error.message === 'Select a valid quote reference.'
    || error.message === 'Type the exact quote reference to confirm deletion.'
    || error.message === 'Enter a deletion reason between 10 and 500 characters.'
  )) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: false, error: 'The quote deletion could not be completed.' }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { ref: string } },
) {
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const actor = await getClientCrmActor(request)
    if (!actor || actor.role !== 'owner') return NextResponse.json({ success: false, error: 'Active owner access required.' }, { status: 403 })
    return NextResponse.json({ success: true, preview: await getQuoteDeletionPreview(params.ref) })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/deletion] Failed to inspect quote deletion:', error)
    return errorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { ref: string } },
) {
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const blockedRequest = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blockedRequest) return blockedRequest

  try {
    const identity = getAdminSessionIdentityFromRequest(request)
    if (!identity || identity.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !['keep', 'delete'].includes(body.linkedRecords) || typeof body.override !== 'boolean' || typeof body.previewToken !== 'string') {
      return NextResponse.json({ success: false, error: 'Review the deletion options before confirming.' }, { status: 400 })
    }
    const actor = await getClientCrmActor(request)
    if (!actor || actor.role !== 'owner') return NextResponse.json({ success: false, error: 'Active owner access required.' }, { status: 403 })
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation : ''
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    const result = await deleteQuoteByRef(params.ref, confirmation, reason, {
      id: actor.id,
      name: actor.username,
      role: 'owner',
    }, { linkedRecords: body.linkedRecords, override: body.override, previewToken: body.previewToken })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/deletion] Failed to delete quote:', error)
    return errorResponse(error)
  }
}
