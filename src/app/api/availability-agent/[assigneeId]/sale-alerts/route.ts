import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'
import { getAdminSupabase } from '@/lib/supabase'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { writeAuditLogStrict } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

const DISMISS_ACTION = 'contract_sale.deposit_alert.dismissed'
const AVAILABILITY_SENT_ACTION = 'contract_sale.inspection.availability_sent'

async function getAuthorizedAgent(request: NextRequest, assigneeId: string) {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, assigneeId))) return null
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity || identity.role !== 'agent') return null
  const account = await getStaffAccountById(identity.id)
  return account?.active && account.role === 'agent' && account.availability_assignee_id === assigneeId
    ? account
    : null
}

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

  const rows = data ?? []
  const saleIds = rows.map((row) => String(row.id))
  const { data: activity, error: activityError } = saleIds.length
    ? await getAdminSupabase()
      .from('admin_audit_log')
      .select('entity_ref, action, details')
      .eq('entity_type', 'contract_sale')
      .in('entity_ref', saleIds)
      .in('action', [DISMISS_ACTION, AVAILABILITY_SENT_ACTION])
      .order('created_at', { ascending: false })
      .limit(200)
    : { data: [], error: null }

  if (activityError) {
    console.error('[availability-agent/sale-alerts] Failed to load alert activity:', activityError)
    return NextResponse.json({ error: 'Unable to load product sale alerts.' }, { status: 500 })
  }

  const acknowledgedSaleIds = new Set<string>()
  for (const item of activity ?? []) {
    const details = item.details && typeof item.details === 'object'
      ? item.details as Record<string, unknown>
      : {}
    if (
      (item.action === AVAILABILITY_SENT_ACTION && details.deliveryStatus === 'sent')
      || (item.action === DISMISS_ACTION && details.actorId === account.id)
    ) {
      acknowledgedSaleIds.add(String(item.entity_ref))
    }
  }

  return NextResponse.json({
    alerts: rows.filter((row) => !acknowledgedSaleIds.has(String(row.id))).map((row) => {
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 8 * 1024)
  if (blocked) return blocked
  const { assigneeId } = await context.params
  const limited = rateLimit(request, { key: `availability-agent-sale-alert-dismiss:${assigneeId}:minute`, limit: 30, windowMs: 60 * 1000 })
  if (limited) return limited

  const account = await getAuthorizedAgent(request, assigneeId)
  if (!account) return NextResponse.json({ error: 'Agent account required.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { saleId?: unknown } | null
  const saleId = typeof body?.saleId === 'string' ? body.saleId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saleId)) {
    return NextResponse.json({ error: 'Select a valid product sale alert.' }, { status: 400 })
  }

  const { data: sale, error } = await getAdminSupabase()
    .from('contract_product_sales')
    .select('id')
    .eq('id', saleId)
    .eq('assigned_staff_id', account.id)
    .eq('status', 'inspection_ready')
    .maybeSingle()
  if (error) {
    console.error('[availability-agent/sale-alerts] Failed to verify alert:', error)
    return NextResponse.json({ error: 'Unable to dismiss the product sale alert.' }, { status: 500 })
  }
  if (!sale) return NextResponse.json({ error: 'Product sale alert not found.' }, { status: 404 })

  try {
    await writeAuditLogStrict('contract_sale', saleId, DISMISS_ACTION, {
      actorId: account.id,
      actorRole: 'agent',
    })
  } catch (auditError) {
    console.error('[availability-agent/sale-alerts] Failed to dismiss alert:', auditError)
    return NextResponse.json({ error: 'Unable to dismiss the product sale alert.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, saleId })
}
