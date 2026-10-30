import { NextRequest, NextResponse } from 'next/server'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { downloadCommissionInvoice, receiveCommissionInvoice } from '@/lib/commissionInvoices'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
export const dynamic = 'force-dynamic'
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof ContractProductError ? error.message : 'Unable to process commission invoice.' }, { status: error instanceof ContractProductError ? error.status : 500 })
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 4 * 1024 * 1024)
  if (blocked) return blocked
  try {
    const actor = await getClientCrmActor(request)
    if (actor?.role !== 'owner') throw new ContractProductError('Owner access required.', 403)
    const limited = await rateLimit(request, { key: `commission-invoice:${actor.id}`, limit: 30, windowMs: 3600000 })
    if (limited) return limited
    return NextResponse.json({ success: true, id: await receiveCommissionInvoice(actor, await request.formData()) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await getClientCrmActor(request)
    if (!actor) throw new ContractProductError('Commission access required.', 403)
    const invoice = await downloadCommissionInvoice(actor, request.nextUrl.searchParams.get('id') || '')
    return new NextResponse(await invoice.blob.arrayBuffer(), { headers: { 'Content-Type': invoice.type, 'Content-Disposition': `attachment; filename="commission-invoice.${invoice.extension}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) { return failure(error) }
}
