import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'
import { getAdminSupabase } from '@/lib/supabase'
import { rateLimit } from '@/lib/abuseProtection'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const { assigneeId } = await context.params
  const limited = rateLimit(request, { key: `availability-agent-sale-alerts:${assigneeId}:minute`, limit: 60, windowMs: 60 * 1000 })
  if (limited) return limited

  if (!(await isAuthorizedAvailabilityAgentRequest(request, assigneeId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity || identity.role !== 'agent') {
    return NextResponse.json({ error: 'Agent account required.' }, { status: 403 })
  }
  const account = await getStaffAccountById(identity.id)
  if (!account?.active || account.role !== 'agent' || account.availability_assignee_id !== assigneeId) {
    return NextResponse.json({ error: 'Agent account required.' }, { status: 403 })
  }

  const { data, error } = await getAdminSupabase()
    .from('contract_product_sales')
    .select('id, sale_code, product_id, product_snapshot')
    .eq('assigned_staff_id', account.id)
    .eq('status', 'inspection_ready')
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[availability-agent/sale-alerts] Failed to load alerts:', error)
    return NextResponse.json({ error: 'Unable to load product sale alerts.' }, { status: 500 })
  }

  return NextResponse.json({
    alerts: (data ?? []).map((row) => {
      const productSnapshot = row.product_snapshot && typeof row.product_snapshot === 'object'
        ? row.product_snapshot as Record<string, unknown>
        : {}
      return {
        saleId: String(row.id),
        saleCode: String(row.sale_code ?? ''),
        productId: String(row.product_id ?? ''),
        productCode: String(productSnapshot.product_code ?? ''),
      }
    }),
  })
}
