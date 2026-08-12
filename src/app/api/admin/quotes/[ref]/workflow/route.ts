import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getQuoteWorkflowByRef, saveQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { parseFirmQuoteDraft, parseInspectionReport } from '@/lib/quoteWorkflow'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

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

    await saveQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/workflow] Failed to save workflow:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save workflow.' },
      { status: 500 }
    )
  }
}
