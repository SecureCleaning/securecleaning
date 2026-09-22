import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import {
  downloadContractSaleChecklist,
  downloadContractSaleChecklistCopy,
  uploadContractSaleChecklistCopy,
} from '@/lib/contractSales'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  try {
    const saleId = request.nextUrl.searchParams.get('saleId') ?? ''
    const uploadId = request.nextUrl.searchParams.get('uploadId') ?? ''
    if (uploadId) {
      const result = await downloadContractSaleChecklistCopy(actor, saleId, uploadId)
      return new NextResponse(result.blob, { headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `${request.nextUrl.searchParams.get('preview') === '1' ? 'inline' : 'attachment'}; filename="${result.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      } })
    }
    const result = await downloadContractSaleChecklist(actor, saleId)
    return new NextResponse(result.pdf, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${request.nextUrl.searchParams.get('preview') === '1' ? 'inline' : 'attachment'}; filename="${result.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) {
    const status = error instanceof ContractProductError ? error.status : 500
    return NextResponse.json({ success: false, error: error instanceof ContractProductError ? error.message : 'Unable to open the site checklist.' }, { status })
  }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 16 * 1024 * 1024)
    ?? rateLimit(request, { key: 'contract-sale-checklist-upload', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ContractProductError('Choose a photographed checklist or PDF to upload.')
    const result = await uploadContractSaleChecklistCopy(actor, { saleId: String(form.get('saleId') ?? ''), file })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const status = error instanceof ContractProductError ? error.status : 500
    return NextResponse.json({ success: false, error: error instanceof ContractProductError ? error.message : 'Unable to upload the completed checklist.' }, { status })
  }
}
