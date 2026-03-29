import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getAuditLog } from '@/lib/auditLog'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entityType') ?? undefined
  const entityRef = searchParams.get('entityRef') ?? undefined

  const logs = await getAuditLog(entityType, entityRef)
  return NextResponse.json({ success: true, logs })
}
