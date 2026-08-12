import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { importCleaners } from '@/lib/cleaners'
import { rejectLargePayload } from '@/lib/abuseProtection'

export async function POST(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'import')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  const blocked = rejectLargePayload(request, 2 * 1024 * 1024)
  if (blocked) return blocked

  try {
    const body = await request.json()
    const result = await importCleaners(body?.records, authorization.identity)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[api/admin/cleaners/import] Failed to import cleaners:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to import cleaners.' },
      { status: 400 }
    )
  }
}
