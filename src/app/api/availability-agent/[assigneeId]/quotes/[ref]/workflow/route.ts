import { NextRequest, NextResponse } from 'next/server'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getFinalQuoteReadiness, isEditableFirmQuoteStatus, parseFirmQuoteDraft, parseInspectionReport } from '@/lib/quoteWorkflow'
import { getQuoteWorkflowByRef, QuoteWorkflowConflictError, reviewQuoteWorkflowByRef, saveQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; ref: string } }
) {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, params.assigneeId))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!isEditableFirmQuoteStatus(body?.firmQuoteDraft?.status)) {
      return NextResponse.json({ success: false, error: 'Save supports only draft or reviewed workflow states.' }, { status: 400 })
    }
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

    const inspectionReport = parseInspectionReport(body?.inspectionReport, quote.inputs)
    const firmQuoteDraft = parseFirmQuoteDraft(body?.firmQuoteDraft, quote.inputs, roomTypeConfig)
    const readiness = getFinalQuoteReadiness(firmQuoteDraft)
    if (firmQuoteDraft.status === 'reviewed' && !readiness.ready) {
      return NextResponse.json({ success: false, error: readiness.errors[0] }, { status: 400 })
    }
    if (quote.finalDocument || quote.firmQuoteDraft.status === 'sent' || quote.firmQuoteDraft.status === 'accepted') {
      return NextResponse.json({ success: false, error: 'Reviewed and sent quotes cannot be changed by a normal save.' }, { status: 409 })
    }
    if (firmQuoteDraft.status === 'reviewed') {
      const sessionIdentity = getAdminSessionIdentityFromRequest(request)
      const staffAccount = sessionIdentity ? await getStaffAccountById(sessionIdentity.id) : null
      const actor = staffAccount?.active && staffAccount.role === 'agent' && staffAccount.availability_assignee_id === assignee.id
        ? { kind: 'staff_account' as const, id: staffAccount.id, name: staffAccount.display_name || staffAccount.username }
        : { kind: 'agent_session' as const, id: assignee.id, name: assignee.name }
      await reviewQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft, {
        ...actor,
      }, await getQuotePricingConfig(), roomTypeConfig)
    } else {
      await saveQuoteWorkflowByRef(params.ref, inspectionReport, firmQuoteDraft)
    }

    return NextResponse.json({ success: true, status: firmQuoteDraft.status })
  } catch (error) {
    console.error('[api/availability-agent/quote-workflow] Failed to save workflow:', error)
    if (error instanceof QuoteWorkflowConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: 'The quote workflow could not be saved.' }, { status: 500 })
  }
}
