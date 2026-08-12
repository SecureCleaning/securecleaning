import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { deleteCleanerDocument, uploadCleanerDocument } from '@/lib/cleaners'

export const runtime = 'nodejs'

const allowedContentTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const maxUploadBytes = 10 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ success: false, error: 'File is required.' }, { status: 400 })
    }

    const uploadedFile = file as File
    if (uploadedFile.size <= 0) {
      return NextResponse.json({ success: false, error: 'File is empty.' }, { status: 400 })
    }

    if (uploadedFile.size > maxUploadBytes) {
      return NextResponse.json({ success: false, error: 'File must be 10MB or less.' }, { status: 400 })
    }

    if (uploadedFile.type && !allowedContentTypes.has(uploadedFile.type)) {
      return NextResponse.json(
        { success: false, error: 'Only PDF, JPG, PNG, and WebP files are supported.' },
        { status: 400 }
      )
    }

    const document = await uploadCleanerDocument({
      cleanerId: params.cleanerId,
      documentType: formData.get('documentType'),
      fileName: uploadedFile.name,
      contentType: uploadedFile.type || 'application/octet-stream',
      sizeBytes: uploadedFile.size,
      data: Buffer.from(await uploadedFile.arrayBuffer()),
      expiryDate: typeof formData.get('expiryDate') === 'string' ? String(formData.get('expiryDate')) : null,
      notes: typeof formData.get('notes') === 'string' ? String(formData.get('notes')) : null,
      uploadedBy: typeof formData.get('uploadedBy') === 'string' ? String(formData.get('uploadedBy')) : 'Admin',
    })

    const replaceDocumentId = typeof formData.get('replaceDocumentId') === 'string'
      ? String(formData.get('replaceDocumentId')).trim()
      : ''

    if (replaceDocumentId) {
      try {
        await deleteCleanerDocument(params.cleanerId, replaceDocumentId)
      } catch (error) {
        await deleteCleanerDocument(params.cleanerId, document.id).catch((cleanupError) => {
          console.error('[api/admin/cleaners/:id/documents] Failed to roll back replacement upload:', cleanupError)
        })
        throw error
      }
    }

    return NextResponse.json({ success: true, document, replacedDocumentId: replaceDocumentId || null })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/documents] Failed to upload document:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to upload document.' },
      { status: 400 }
    )
  }
}
