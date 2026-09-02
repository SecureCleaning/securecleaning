import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { createCleanerJobsAccessToken } from '@/lib/cleanerJobsAccess'
import { getContractProductActor } from '@/lib/contractProductAuth'
import {
  getContractProductBroadcastHistory,
  previewContractProductBroadcast,
  sendContractProductBroadcast,
} from '@/lib/contractProductBroadcasts'
import {
  ContractProductError,
  getActiveJobsAccessLinkId,
  getContractProducts,
  publishContractProduct,
  updateContractProduct,
  withdrawContractProduct,
} from '@/lib/contractProducts'
import { getSiteUrl } from '@/lib/siteUrl'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Contract product access required.' }, { status: 403 })
  try {
    const [products, broadcasts, accessLinkId] = await Promise.all([
      getContractProducts(actor),
      getContractProductBroadcastHistory(actor),
      getActiveJobsAccessLinkId(),
    ])
    const accessToken = accessLinkId ? createCleanerJobsAccessToken(accessLinkId) : ''
    return NextResponse.json({
      success: true,
      products,
      broadcasts,
      actor: { id: actor.id, role: actor.role, state: actor.productState, displayName: actor.displayName },
      jobsUrl: accessToken ? `${getSiteUrl()}/jobs/access/${encodeURIComponent(accessToken)}` : '',
    })
  } catch (error) {
    console.error('[api/admin/contract-products] Failed to load:', error)
    return NextResponse.json({ success: false, error: 'Unable to load contract products.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Contract product access required.' }, { status: 403 })
  try {
    const body = await request.json() as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    if (action === 'product.update') return NextResponse.json({ success: true, result: await updateContractProduct(actor, body) })
    if (action === 'product.publish') return NextResponse.json({ success: true, result: await publishContractProduct(actor, body) })
    if (action === 'product.withdraw') return NextResponse.json({ success: true, result: await withdrawContractProduct(actor, body) })
    if (action === 'broadcast.preview') return NextResponse.json({ success: true, result: await previewContractProductBroadcast(actor, body) })
    if (action === 'broadcast.send') {
      const limited = rateLimit(request, { key: `contract-product-broadcast:${actor.id}`, limit: 5, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await sendContractProductBroadcast(actor, body) })
    }
    return NextResponse.json({ success: false, error: 'Select a valid contract product action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof ContractProductError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[api/admin/contract-products] Operation failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to complete the contract product operation.' }, { status: 500 })
  }
}
