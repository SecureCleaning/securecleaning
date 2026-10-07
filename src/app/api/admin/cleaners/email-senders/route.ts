import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { getCleanerEmailSenders } from '@/lib/cleanerEmailSenders'
export async function GET(request: NextRequest) {
  const auth = await authorizeCleanerAdminRequest(request, 'email')
  if (!auth.identity) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try { return NextResponse.json({ success: true, ...await getCleanerEmailSenders(auth.identity) }) }
  catch { return NextResponse.json({ success: false, error: 'Unable to load sender details. Check your active Team Access account.' }, { status: 400 }) }
}
