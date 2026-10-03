import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getAdminAlerts } from '@/lib/alerts'

export async function GET(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const alerts = await getAdminAlerts()
  return NextResponse.json({ success: true, alerts })
}
