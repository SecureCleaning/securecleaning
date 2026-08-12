import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { exportCleanersCsv } from '@/lib/cleaners'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const csv = await exportCleanersCsv()
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
