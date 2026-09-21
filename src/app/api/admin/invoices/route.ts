import { NextRequest, NextResponse } from 'next/server'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { getInvoiceDirectory } from '@/lib/invoiceDirectory'
import { parseInvoiceDirectoryQuery } from '@/lib/invoiceDirectoryPolicy'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  try {
    const actor = await getContractProductActor(request)
    if (!actor) return NextResponse.json({ error: 'Invoice access required.' }, { status: 403, headers })
    let filters
    try { filters = parseInvoiceDirectoryQuery(request.nextUrl.searchParams) }
    catch { return NextResponse.json({ error: 'Invalid invoice filters.' }, { status: 400, headers }) }
    return NextResponse.json({ ...await getInvoiceDirectory(actor, filters), assigneeId: actor.role === 'agent' ? actor.availabilityAssigneeId : null }, { headers })
  } catch {
    return NextResponse.json({ error: 'Unable to load invoices. Please try again.' }, { status: 500, headers })
  }
}
