import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { rateLimit, rejectCrossOriginMutation } from '@/lib/abuseProtection'
import { cleanerEmailResults, deliverCleanerEmail, previewCleanerEmail } from '@/lib/cleanerEmailDelivery'
import { CleanerEmailError } from '@/lib/cleanerEmailPolicy'

export async function POST(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'email')
  if (!authorization.identity) return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  const blocked = rejectCrossOriginMutation(request) || rateLimit(request, { key: `cleaner-email:${authorization.identity.id}`, limit: 30, windowMs: 60_000 })
  if (blocked) return blocked
  try {
    const text = await request.text()
    if (text.length > 512 * 1024) return NextResponse.json({ success: false, error: 'Request is too large.' }, { status: 413 })
    const input = JSON.parse(text)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CleanerEmailError('Invalid email request.')
    const actor = authorization.identity
    if (input.action === 'preview') return NextResponse.json({ success: true, preview: await previewCleanerEmail(actor, input) })
    if (input.action === 'send') return NextResponse.json({ success: true, result: await deliverCleanerEmail(actor, input) })
    if (input.action === 'status') return NextResponse.json({ success: true, result: await cleanerEmailResults(actor, input.requestId) })
    throw new CleanerEmailError('Choose preview or send.')
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof CleanerEmailError ? error.message : 'Unable to complete the email request. If you clicked Send, check delivery status before starting another message.' }, { status: 400 })
  }
}
