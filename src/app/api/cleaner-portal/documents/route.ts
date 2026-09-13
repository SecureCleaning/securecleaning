import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation } from '@/lib/abuseProtection'
import { CLEANER_PORTAL_COOKIE, verifyCleanerPortalToken } from '@/lib/cleanerPortalAccess'
import { uploadCleanerPortalDocument } from '@/lib/cleanerPortal'

export const runtime = 'nodejs'
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const maxBytes = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rateLimit(request, { key: 'cleaner-portal-upload', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked
  const claims = verifyCleanerPortalToken(request.cookies.get(CLEANER_PORTAL_COOKIE)?.value)
  if (!claims) return NextResponse.json({ success: false, error: 'Your access link is invalid or has expired.' }, { status: 401 })
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes + 64 * 1024) return NextResponse.json({ success: false, error: 'File must be 10 MB or less.' }, { status: 413 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) throw new Error('Select a document to upload.')
    const upload = file as File
    if (upload.size <= 0 || upload.size > maxBytes) throw new Error('File must be between 1 byte and 10 MB.')
    if (!allowedTypes.has(upload.type)) throw new Error('Only PDF, JPG, PNG and WebP files are supported.')
    const document = await uploadCleanerPortalDocument(claims, {
      documentType: form.get('documentType'), fileName: upload.name, contentType: upload.type,
      sizeBytes: upload.size, data: Buffer.from(await upload.arrayBuffer()),
      expiryDate: typeof form.get('expiryDate') === 'string' ? String(form.get('expiryDate')) : null,
      notes: typeof form.get('notes') === 'string' ? String(form.get('notes')) : null,
    })
    return NextResponse.json({ success: true, document: { id: document.id, documentType: document.document_type, fileName: document.file_name, createdAt: document.created_at } })
  } catch (error) {
    console.error('[api/cleaner-portal/documents] Upload failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to upload document.' }, { status: 400 })
  }
}
