import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { deleteCleanerDocument, downloadCleanerDocument } from '@/lib/cleaners'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { cleanerId: string; documentId: string } }
) {
  const authorization = authorizeCleanerAdminRequest(request, 'documentDownload')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const { document, file } = await downloadCleanerDocument(params.cleanerId, params.documentId)
    return new Response(file, {
      headers: {
        'Content-Type': document.content_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${document.file_name.replace(/"/g, '')}"`,
      },
    })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/documents/:documentId] Failed to download document:', error)
    return NextResponse.json({ success: false, error: 'Document not found.' }, { status: 404 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { cleanerId: string; documentId: string } }
) {
  const authorization = authorizeCleanerAdminRequest(request, 'documentDelete')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const document = await deleteCleanerDocument(params.cleanerId, params.documentId, authorization.identity)
    return NextResponse.json({ success: true, document })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/documents/:documentId] Failed to delete document:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete document.' },
      { status: 400 }
    )
  }
}
