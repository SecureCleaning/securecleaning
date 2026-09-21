import { NextRequest, NextResponse } from 'next/server'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import { getCommissionWorkspace, manageCommission } from '@/lib/commissions'
import { ContractProductError } from '@/lib/contractProducts'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ error: 'Commission access required.' }, { status: 403 })
  try { return NextResponse.json(await getCommissionWorkspace(actor), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (error) { return NextResponse.json({ error: error instanceof ContractProductError ? error.message : 'Unable to load commissions.' }, { status: error instanceof ContractProductError ? error.status : 500 }) }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 16384)
  if (blocked) return blocked
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ error: 'Commission access required.' }, { status: 403 })
  const limited = rateLimit(request, { key: `commission:${actor.id}`, limit: 60, windowMs: 3600000 })
  if (limited) return limited
  try { await manageCommission(actor, await request.json()); return NextResponse.json({ success: true }) }
  catch (error) { return NextResponse.json({ error: error instanceof ContractProductError ? error.message : 'Unable to save commissions.' }, { status: error instanceof ContractProductError ? error.status : 500 }) }
}
