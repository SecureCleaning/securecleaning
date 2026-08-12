import { NextRequest, NextResponse } from 'next/server'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { parseFirmQuoteDraft, parseInspectionReport } from '@/lib/quoteWorkflow'
import { getQuoteWorkflowByRef, saveQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; ref: string } }
) {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, params.assigneeId))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, params.assigneeId)
    const roomTypeConfig = await getQuoteRoomTypeConfig()
    const quote = await getQuoteWorkflowByRef(params.ref, roomTypeConfig)

    if (!assignee || !quote) return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })

    const serviceZones = getAssigneeServiceZones(config, params.assigneeId)
    const allowed = quote.inputs.city === assignee.city && (
      serviceZones.length === 0 || locationMatchesServiceZones(quote.inputs, quote.inputs.city, serviceZones)
    )
    if (!allowed) return NextResponse.json({ success: false, error: 'This quote is outside your assigned service region.' }, { status: 403 })

    if (!quote.workflowColumnsAvailable) {
      return NextResponse.json({ success: false, error: 'Workflow storage columns are not available yet.' }, { status: 409 })
    }

    const body = await request.json()
    const inspectionReport = parseInspectionReport(body?.inspectionReport, quote.inputs)
    const firmQuoteDraft = parseFirmQuoteDraft(body?.firmQuoteDraft, quote.inputs, roomTypeConfig)
    await saveQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/availability-agent/quote-workflow] Failed to save workflow:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to save workflow.' }, { status: 500 })
  }
}
