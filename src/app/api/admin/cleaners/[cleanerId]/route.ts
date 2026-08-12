import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getCleanerDetail, updateCleaner } from '@/lib/cleaners'

export async function GET(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
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
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const cleaner = await updateCleaner(params.cleanerId, payload)
    return NextResponse.json({ success: true, cleaner })
  } catch (error) {
    console.error('[api/admin/cleaners/:id] Failed to update cleaner:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update cleaner.' },
      { status: 400 }
    )
  }
}
