import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { fetchSupplier, parseSupplierProduct } from '@/lib/consumablesSupplier'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request, 'manager')) return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 4096)
  if (blocked) return blocked
  try {
    const body = await request.json()
    const { bytes, url } = await fetchSupplier(body.url)
    return NextResponse.json({ success: true, product: parseSupplierProduct(bytes.toString('utf8'), url) })
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to read that product. Use a Sydney Cleaning Supplies product URL, or enter the details manually.' }, { status: 400 })
  }
}
