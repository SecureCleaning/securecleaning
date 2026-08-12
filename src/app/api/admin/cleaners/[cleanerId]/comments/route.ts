import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { addCleanerComment } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  const authorization = authorizeCleanerAdminRequest(request, 'comment')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const body = await request.json()
    const comment = await addCleanerComment(params.cleanerId, body?.comment, authorization.identity)
    return NextResponse.json({ success: true, comment })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/comments] Failed to add comment:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add comment.' },
      { status: 400 }
    )
  }
}
