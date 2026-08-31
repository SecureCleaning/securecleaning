import { NextRequest, NextResponse } from 'next/server'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { downloadContractSaleInvoice } from '@/lib/contractSales'
import { ContractProductError } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  try {
    const saleId = request.nextUrl.searchParams.get('saleId') ?? ''
    const invoiceId = request.nextUrl.searchParams.get('invoiceId') ?? ''
    const result = await downloadContractSaleInvoice(actor, saleId, invoiceId)
    return new NextResponse(result.pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof ContractProductError) return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    console.error('[api/admin/contract-sales/invoices] Download failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to generate the tax invoice.' }, { status: 500 })
  }
}
