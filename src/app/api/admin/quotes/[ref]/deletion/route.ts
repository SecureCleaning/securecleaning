import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import {
  deleteQuoteByRef,
  getQuoteDeletionPreview,
  QuoteDeletionBlockedError,
  QuoteDeletionNotFoundError,
} from '@/lib/quoteDeletion'

function errorResponse(error: unknown) {
  if (error instanceof QuoteDeletionNotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 })
  }
  if (error instanceof QuoteDeletionBlockedError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 409 })
  }
  if (error instanceof Error && (
    error.message === 'Select a valid quote reference.'
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

    const body = await request.json()
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation : ''
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    const result = await deleteQuoteByRef(params.ref, confirmation, reason, {
      id: identity.id,
      name: identity.username,
      role: 'owner',
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/deletion] Failed to delete quote:', error)
    return errorResponse(error)
  }
}
