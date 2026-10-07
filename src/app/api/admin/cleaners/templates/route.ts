import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { listCleanerEmailTemplates, saveCleanerEmailTemplate } from '@/lib/cleanerEmailTemplates'

export async function GET(request: NextRequest) {
  const auth = await authorizeCleanerAdminRequest(request, 'list')
  if (!auth.identity) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json({ success: true, templates: await listCleanerEmailTemplates() })
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to load cleaner templates.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 256 * 1024)
  if (blocked) return blocked
  const auth = await authorizeCleanerAdminRequest(request, 'mutate')
  if (!auth.identity) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    const template = await saveCleanerEmailTemplate(await request.json(), auth.identity)
    return NextResponse.json({ success: true, template })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to save template.' }, { status: 400 })
  }
}
