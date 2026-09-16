import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { CONSUMABLE_IMAGE_BUCKET } from '@/lib/consumables'
import { getAdminSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMAGE_TYPES: Record<string, { extension: string; signatures: number[][] }> = {
  'image/jpeg': { extension: 'jpg', signatures: [[0xff, 0xd8, 0xff]] },
  'image/png': { extension: 'png', signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  'image/webp': { extension: 'webp', signatures: [[0x52, 0x49, 0x46, 0x46]] },
}

function hasSignature(buffer: Uint8Array, signatures: number[][]) {
  return signatures.some((signature) => signature.every((byte, index) => buffer[index] === byte))
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  }
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 6 * 1024 * 1024)
  if (blocked) return blocked
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity) return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Choose an image.' }, { status: 400 })
    const imageType = IMAGE_TYPES[file.type]
    if (!imageType) return NextResponse.json({ success: false, error: 'Use a JPG, PNG or WebP image.' }, { status: 400 })
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Images must be between 1 byte and 5 MB.' }, { status: 400 })
    }
    const buffer = new Uint8Array(await file.arrayBuffer())
    if (!hasSignature(buffer, imageType.signatures) || (file.type === 'image/webp' && String.fromCharCode(...buffer.slice(8, 12)) !== 'WEBP')) {
      return NextResponse.json({ success: false, error: 'The uploaded file is not a valid image.' }, { status: 400 })
    }
    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${imageType.extension}`
    const db = getAdminSupabase()
    const upload = await db.storage.from(CONSUMABLE_IMAGE_BUCKET).upload(path, buffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    })
    if (upload.error) throw upload.error
    const imageUrl = db.storage.from(CONSUMABLE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    const audit = await db.from('admin_audit_log').insert({
      entity_type: 'consumables_catalogue',
      entity_ref: path,
      action: 'consumables.image.uploaded',
      details: { actorId: identity.id, contentType: file.type, bytes: file.size },
    })
    if (audit.error) {
      await db.storage.from(CONSUMABLE_IMAGE_BUCKET).remove([path])
      throw audit.error
    }
    return NextResponse.json({ success: true, imageUrl })
  } catch (error) {
    console.error('[api/admin/consumables/image] Image upload failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to upload the product image.' }, { status: 500 })
  }
}
