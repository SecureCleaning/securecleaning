import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import {
  ClientCrmDeletionAuthorizationError,
  ClientCrmDeletionBlockedError,
  ClientCrmDeletionNotFoundError,
  deleteClientCrmRecord,
  getClientCrmDeletionPreview,
} from '@/lib/clientCrmDeletion'

function errorResponse(error: unknown) {
  if (error instanceof ClientCrmDeletionAuthorizationError) return NextResponse.json({ success: false, error: error.message }, { status: 403 })
  if (error instanceof ClientCrmDeletionNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 })
  if (error instanceof ClientCrmDeletionBlockedError) return NextResponse.json({ success: false, error: error.message }, { status: 409 })
  if (error instanceof Error && [
    'Select a valid CRM record.',
    'Type the exact client email shown to confirm deletion.',
    'Enter a deletion reason between 10 and 500 characters.',
    'Review the deletion options before confirming.',
  ].includes(error.message)) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: false, error: 'The CRM record deletion could not be completed.' }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: { opportunityId: string } }) {
  if (!isAuthorizedAdminRequest(request, 'owner')) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const actor = await getClientCrmActor(request)
    if (!actor || actor.role !== 'owner') return NextResponse.json({ success: false, error: 'Active owner access required.' }, { status: 403 })
    return NextResponse.json({ success: true, preview: await getClientCrmDeletionPreview(params.opportunityId) })
  } catch (error) {
    console.error('[api/admin/client-crm/deletion] Failed to inspect CRM deletion:', error)
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { opportunityId: string } }) {
  if (!isAuthorizedAdminRequest(request, 'owner')) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const blockedRequest = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blockedRequest) return blockedRequest

  try {
    const identity = getAdminSessionIdentityFromRequest(request)
    if (!identity || identity.role !== 'owner') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body.deleteBookings !== 'boolean' || typeof body.override !== 'boolean' || typeof body.previewToken !== 'string') {
      return NextResponse.json({ success: false, error: 'Review the deletion options before confirming.' }, { status: 400 })
    }
    const actor = await getClientCrmActor(request)
    if (!actor || actor.role !== 'owner') return NextResponse.json({ success: false, error: 'Active owner access required.' }, { status: 403 })
    const result = await deleteClientCrmRecord(
      params.opportunityId,
      typeof body.confirmation === 'string' ? body.confirmation : '',
      typeof body.reason === 'string' ? body.reason : '',
      { id: actor.id, name: actor.username, role: 'owner' },
      { deleteBookings: body.deleteBookings, override: body.override, previewToken: body.previewToken },
    )
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[api/admin/client-crm/deletion] Failed to delete CRM record:', error)
    return errorResponse(error)
  }
}
