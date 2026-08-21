import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation } from '@/lib/abuseProtection'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { uploadCleanerDocumentForState } from '@/lib/cleaners'

export const runtime = 'nodejs'

const allowedContentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const maxUploadBytes = 10 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const blocked = rejectCrossOriginMutation(request)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-document:${context.assignee.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ success: false, error: 'File is required.' }, { status: 400 })
    }
    const uploadedFile = file as File
    if (uploadedFile.size <= 0 || uploadedFile.size > maxUploadBytes) {
      return NextResponse.json({ success: false, error: 'File must be between 1 byte and 10MB.' }, { status: 400 })
    }
    if (uploadedFile.type && !allowedContentTypes.has(uploadedFile.type)) {
      return NextResponse.json({ success: false, error: 'Only PDF, JPG, PNG, and WebP files are supported.' }, { status: 400 })
    }

    const document = await uploadCleanerDocumentForState({
      cleanerId: params.cleanerId,
      state: context.state,
      documentType: formData.get('documentType'),
      fileName: uploadedFile.name,
      contentType: uploadedFile.type || 'application/octet-stream',
      sizeBytes: uploadedFile.size,
      data: Buffer.from(await uploadedFile.arrayBuffer()),
      expiryDate: typeof formData.get('expiryDate') === 'string' ? String(formData.get('expiryDate')) : null,
      notes: typeof formData.get('notes') === 'string' ? String(formData.get('notes')) : null,
      actor: context.actor,
    })
    return NextResponse.json({ success: true, document })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to upload document.' }, { status: 400 })
  }
}
