import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getContractProductActor } from '@/lib/contractProductAuth'
import {
  cancelContractSale,
  completeContractSaleHandover,
  completeContractSaleInspection,
  confirmContractSalePayment,
  createCleanerInsideContractSale,
  createContractSale,
  createContractSaleAgreement,
  createContractSalePaymentPlan,
  getContractSaleWorkspace,
  issueContractSaleInvoice,
  recordContractSalePayment,
  resendContractSaleInvoice,
  scheduleContractSaleInspection,
  sendContractSaleAgreement,
  updateContractSale,
} from '@/lib/contractSales'
import { ContractProductError } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  try {
    return NextResponse.json({ success: true, ...(await getContractSaleWorkspace(actor)) })
  } catch (error) {
    console.error('[api/admin/contract-sales] Failed to load:', error)
    return NextResponse.json({ success: false, error: 'Unable to load product sales.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 64 * 1024)
  if (blocked) return blocked
  const actor = await getContractProductActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Product sale access required.' }, { status: 403 })
  try {
    const body = await request.json() as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    if (action === 'cleaner.create') return NextResponse.json({ success: true, result: await createCleanerInsideContractSale(actor, body) })
    if (action === 'sale.create') return NextResponse.json({ success: true, result: await createContractSale(actor, body) })
    if (action === 'sale.update') return NextResponse.json({ success: true, result: await updateContractSale(actor, body) })
    if (action === 'invoice.issue') {
      const limited = rateLimit(request, { key: `contract-sale-invoice:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await issueContractSaleInvoice(actor, body) })
    }
    if (action === 'invoice.resend') {
      const limited = rateLimit(request, { key: `contract-sale-invoice-resend:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await resendContractSaleInvoice(actor, body) })
    }
    if (action === 'payment.record') {
      const limited = rateLimit(request, { key: `contract-sale-payment:${actor.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await recordContractSalePayment(actor, body) })
    }
    if (action === 'payment.confirm') return NextResponse.json({ success: true, result: await confirmContractSalePayment(actor, body) })
    if (action === 'inspection.schedule') {
      const limited = rateLimit(request, { key: `contract-sale-inspection:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await scheduleContractSaleInspection(actor, body) })
    }
    if (action === 'inspection.complete') return NextResponse.json({ success: true, result: await completeContractSaleInspection(actor, body) })
    if (action === 'agreement.create') return NextResponse.json({ success: true, result: await createContractSaleAgreement(actor, body) })
    if (action === 'agreement.send') {
      const limited = rateLimit(request, { key: `contract-sale-agreement:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await sendContractSaleAgreement(actor, body) })
    }
    if (action === 'payment-plan.create') return NextResponse.json({ success: true, result: await createContractSalePaymentPlan(actor, body) })
    if (action === 'handover.complete') return NextResponse.json({ success: true, result: await completeContractSaleHandover(actor, body) })
    if (action === 'sale.cancel') return NextResponse.json({ success: true, result: await cancelContractSale(actor, body) })
    return NextResponse.json({ success: false, error: 'Select a valid product sale action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof ContractProductError) return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    console.error('[api/admin/contract-sales] Operation failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to complete the product sale operation.' }, { status: 500 })
  }
}
