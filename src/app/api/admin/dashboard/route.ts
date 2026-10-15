import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getAdminDashboardRefresh } from '@/lib/adminDashboardRefresh'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request)) return NextResponse.json({ success:false,error:'Unauthorized' },{status:401})
  const tab=request.nextUrl.searchParams.get('tab')
  if (tab!=='quotes' && tab!=='bookings' && tab!=='leads') return NextResponse.json({success:false,error:'Select a valid dashboard tab.'},{status:400})
  try { return NextResponse.json({success:true,...await getAdminDashboardRefresh(tab,request.nextUrl.searchParams.get('alerts')==='1')}) }
  catch { return NextResponse.json({success:false,error:'Unable to refresh dashboard.'},{status:503}) }
}
