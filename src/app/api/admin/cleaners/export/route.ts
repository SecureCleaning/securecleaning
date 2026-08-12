import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { exportCleanersCsv } from '@/lib/cleaners'

export async function GET(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'export')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const csv = await exportCleanersCsv(authorization.identity)
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="secure-cleaning-cleaners-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[api/admin/cleaners/export] Failed to export cleaners:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to export cleaners.' },
      { status: 400 }
    )
  }
}
