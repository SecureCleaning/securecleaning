import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { addContractNote, getContractNotes } from '@/lib/contractNotes'

export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  if (error instanceof ContractProductError) return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  return NextResponse.json({ success: false, error: 'Unable to access notes. Please try again.' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getContractProductActor(request)
    if (!actor) return NextResponse.json({ success: false, error: 'Product access required.' }, { status: 403 })
    const notes = await getContractNotes(actor, Object.fromEntries(request.nextUrl.searchParams))
    return NextResponse.json({ success: true, notes }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  try {
    const actor = await getContractProductActor(request)
    if (!actor) return NextResponse.json({ success: false, error: 'Product access required.' }, { status: 403 })
    const limited = await rateLimit(request, { key: `contract-notes:${actor.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
    if (limited) return limited
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractProductError('Invalid note.')
    return NextResponse.json({ success: true, note: await addContractNote(actor, body as Record<string, unknown>) })
  } catch (error) { return failure(error) }
}
