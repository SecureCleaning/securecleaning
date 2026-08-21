import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation } from '@/lib/abuseProtection'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { deleteCleanerDocumentForState, downloadCleanerDocumentForState } from '@/lib/cleaners'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string; documentId: string } },
) {
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { document, file } = await downloadCleanerDocumentForState(params.cleanerId, params.documentId, context.state)
    return new Response(file, {
      headers: {
        'Content-Type': document.content_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${document.file_name.replace(/"/g, '')}"`,
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Document not found.' }, { status: 404 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string; documentId: string } },
) {
  const blocked = rejectCrossOriginMutation(request)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-document-delete:${context.assignee.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled
  try {
    const document = await deleteCleanerDocumentForState(params.cleanerId, params.documentId, context.state, context.actor)
    return NextResponse.json({ success: true, document })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to delete document.' }, { status: 400 })
  }
}
