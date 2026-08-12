import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { getCleanerDetail, updateCleaner } from '@/lib/cleaners'

export async function GET(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  const authorization = authorizeCleanerAdminRequest(request, 'detail')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const detail = await getCleanerDetail(params.cleanerId)
    return NextResponse.json({ success: true, ...detail })
  } catch (error) {
    console.error('[api/admin/cleaners/:id] Failed to load cleaner:', error)
    return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  const authorization = authorizeCleanerAdminRequest(request, 'mutate')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const payload = await request.json()
    const cleaner = await updateCleaner(params.cleanerId, payload, authorization.identity)
    return NextResponse.json({ success: true, cleaner })
  } catch (error) {
    console.error('[api/admin/cleaners/:id] Failed to update cleaner:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update cleaner.' },
      { status: 400 }
    )
  }
}
