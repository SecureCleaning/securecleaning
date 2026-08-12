import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { addCleanerComment } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const comment = await addCleanerComment(params.cleanerId, body?.comment, body?.authorName)
    return NextResponse.json({ success: true, comment })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/comments] Failed to add comment:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add comment.' },
      { status: 400 }
    )
  }
}
