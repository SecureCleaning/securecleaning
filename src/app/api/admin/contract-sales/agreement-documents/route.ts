import { NextRequest, NextResponse } from 'next/server'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { correctAgreementDocument, downloadAgreementHistory, getAgreementDocuments, getVisibleAgreementDocuments, downloadVisibleSupportingDocument } from '@/lib/agreementDocuments'
export const dynamic = 'force-dynamic'
function failure(error: unknown) {
  return NextResponse.json({ success: false, error: error instanceof ContractProductError ? error.message : 'Unable to manage agreement documents.' }, { status: error instanceof ContractProductError ? error.status : 500 })
}
export async function GET(request: NextRequest) {
  try {
    const actor = await getContractProductActor(request)
    if (!actor) throw new ContractProductError('Admin access required.', 403)
    const query = request.nextUrl.searchParams
    if (query.get('view') === 'current') {
      if (query.has('eventId')) {
        const result = await downloadVisibleSupportingDocument(actor, query.get('saleId') ?? '', query.get('eventId') ?? '')
        return new NextResponse(await result.blob.arrayBuffer(), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.name}"`, 'Cache-Control': 'private, no-store' } })
      }
      return NextResponse.json({ success: true, result: await getVisibleAgreementDocuments(actor, query.get('saleId') ?? '') }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (query.has('eventId')) {
      const result = await downloadAgreementHistory(actor, query.get('saleId') ?? '', query.get('agreementId') ?? '', query.get('eventId') ?? '', query.get('side') ?? '')
      return new NextResponse(await result.blob.arrayBuffer(), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.name}"`, 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json({ success: true, result: await getAgreementDocuments(actor, query.get('saleId') ?? '', query.get('agreementId') ?? '') }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 11 * 1024 * 1024)
  if (blocked) return blocked
  try {
    const actor = await getContractProductActor(request)
    if (!actor) throw new ContractProductError('Admin access required.', 403)
    return NextResponse.json({ success: true, result: await correctAgreementDocument(actor, await request.formData()) })
  } catch (error) { return failure(error) }
}
