import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getQuoteWorkflowByRef, QuoteWorkflowConflictError, reviewQuoteWorkflowByRef, reviseQuoteWorkflowByRef, saveQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { getFinalQuoteReadiness, isEditableFirmQuoteStatus, parseFirmQuoteDraft, parseInspectionReport } from '@/lib/quoteWorkflow'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import { getQuotePricingConfig } from '@/lib/pricing'

export async function GET(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const quote = await getQuoteWorkflowByRef(params.ref)
  if (!quote) {
    return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, quote })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!isEditableFirmQuoteStatus(body?.firmQuoteDraft?.status)) {
      return NextResponse.json({ success: false, error: 'Save supports only draft or reviewed workflow states.' }, { status: 400 })
    }
    const quote = await getQuoteWorkflowByRef(params.ref)
    const roomTypeConfig = await getQuoteRoomTypeConfig()

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
    }

    if (!quote.workflowColumnsAvailable) {
      return NextResponse.json(
        { success: false, error: 'Workflow storage columns are not available yet. Apply the quote workflow migration first.' },
        { status: 409 }
      )
    }

    const inspectionReport = parseInspectionReport(body?.inspectionReport, quote.inputs)
    const firmQuoteDraft = parseFirmQuoteDraft(body?.firmQuoteDraft, quote.inputs, roomTypeConfig)
    const readiness = getFinalQuoteReadiness(firmQuoteDraft)
    if (firmQuoteDraft.status === 'reviewed' && !readiness.ready) {
      return NextResponse.json({ success: false, error: readiness.errors[0] }, { status: 400 })
    }

    const identity = getAdminSessionIdentityFromRequest(request)
    if (!identity) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const actor = { kind: 'staff_account' as const, id: identity.id, name: identity.username }

    if (quote.finalDocument) {
      if (quote.firmQuoteDraft.status === 'accepted') {
        return NextResponse.json({ success: false, error: 'Accepted quotes are locked because downstream contract records may already rely on them.' }, { status: 409 })
      }
      if (body?.revision !== true || !Number.isInteger(body?.expectedDocumentVersion) || body.expectedDocumentVersion < 1) {
        return NextResponse.json({ success: false, error: 'A versioned final-quote revision is required.' }, { status: 409 })
      }
      const finalDocument = await reviseQuoteWorkflowByRef(
        params.ref, body.expectedDocumentVersion, inspectionReport, firmQuoteDraft, actor,
        await getQuotePricingConfig(), roomTypeConfig
      )
      return NextResponse.json({ success: true, status: 'reviewed', revised: true, documentVersion: finalDocument.version })
    }

    if (quote.firmQuoteDraft.status === 'sent' || quote.firmQuoteDraft.status === 'accepted') {
      return NextResponse.json({ success: false, error: 'Reviewed and sent quotes cannot be changed by a normal save.' }, { status: 409 })
    }

    if (firmQuoteDraft.status === 'reviewed') {
      await reviewQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft, actor, await getQuotePricingConfig(), roomTypeConfig)
    } else {
      await saveQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft)
    }

    return NextResponse.json({ success: true, status: firmQuoteDraft.status })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/workflow] Failed to save workflow:', error)
    if (error instanceof QuoteWorkflowConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    return NextResponse.json(
      { success: false, error: 'The quote workflow could not be saved.' },
      { status: 500 }
    )
  }
}
