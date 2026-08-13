import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { migrateAvailabilityAgentsToStaffAccounts } from '@/lib/staffAgentMigration'

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blocked) return blocked
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Owner access required.' }, { status: 403 })
  }

  try {
    const migrated = await migrateAvailabilityAgentsToStaffAccounts()
    return NextResponse.json({ success: true, migrated })
  } catch (error) {
    console.error('[api/admin/staff/migrate] Failed to migrate availability agents:', error)
    return NextResponse.json({ success: false, error: 'Unable to migrate availability agents.' }, { status: 500 })
  }
}
