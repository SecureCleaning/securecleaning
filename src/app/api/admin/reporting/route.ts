import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getReportingSnapshot } from '@/lib/reporting'

export async function GET(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const snapshot = await getReportingSnapshot()
  return NextResponse.json({ success: true, snapshot })
}
