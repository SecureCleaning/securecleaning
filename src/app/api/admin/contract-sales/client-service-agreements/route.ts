import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { downloadClientServiceAgreement, uploadSignedClientServiceAgreement } from '@/lib/contractSales'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  const limited = await rateLimit(request, { key: `client-service-agreement-download:${actor.id}`, limit: 120, windowMs: 60 * 60 * 1000 })
  if (limited) return limited
  try {
    const result = await downloadClientServiceAgreement(
      actor,
      request.nextUrl.searchParams.get('saleId') ?? '',
      request.nextUrl.searchParams.get('agreementId') ?? '',
      request.nextUrl.searchParams.get('signed') === '1',
    )
    return new NextResponse(await result.blob.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    const status = error instanceof ContractProductError ? error.status : 500
    return NextResponse.json({ success: false, error: error instanceof ContractProductError ? error.message : 'Unable to download client service agreement.' }, { status })
  }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 11 * 1024 * 1024)
  if (blocked) return blocked
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  const limited = await rateLimit(request, { key: `client-service-agreement-upload:${actor.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (limited) return limited
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ContractProductError('Choose a signed PDF to upload.')
    const result = await uploadSignedClientServiceAgreement(actor, {
      saleId: String(form.get('saleId') ?? ''),
      agreementId: String(form.get('agreementId') ?? ''),
      file,
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const status = error instanceof ContractProductError ? error.status : 500
    return NextResponse.json({ success: false, error: error instanceof ContractProductError ? error.message : 'Unable to upload client service agreement.' }, { status })
  }
}
