import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { parseConsumablesImportFile } from '@/lib/consumablesImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  }
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 6 * 1024 * 1024)
  if (blocked) return blocked
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Choose an Excel or CSV file.' }, { status: 400 })
    }
    const preview = await parseConsumablesImportFile(file)
    return NextResponse.json({ success: true, preview })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read the spreadsheet.'
    console.error('[api/admin/consumables/import] Import preview failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
