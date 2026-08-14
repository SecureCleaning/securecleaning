import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import QuoteWorkflowEditor from '@/components/admin/QuoteWorkflowEditor'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { hasAvailabilityAgentSession } from '@/lib/availabilityAgentAuth'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export const dynamic = 'force-dynamic'

export default async function AvailabilityAgentQuotePage({
  params,
}: {
  params: Promise<{ assigneeId: string; ref: string }>
}) {
  const { assigneeId, ref } = await params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  const redirectPath = `/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(ref)}`

  if (!assignee) return <div className="p-10 text-center">Agent not found.</div>
  const authenticated = await hasAvailabilityAgentSession(assigneeId)
  if (!assignee.accessCodeHash && !authenticated) return <div className="p-10 text-center">Agent access is not configured yet.</div>

  if (!authenticated) {
    return (
      <AvailabilityAgentLogin
        assigneeId={assigneeId}
        assigneeName={assignee.name}
        defaultUsername={assignee.username ?? ''}
        lockUsername={Boolean(assignee.username)}
        redirectPath={redirectPath}
        title="Agent quote access"
        description="Sign in to review and update quotes assigned to your service region."
        submitLabel="Open quote workbench"
      />
    )
  }

  const roomTypeConfig = await getQuoteRoomTypeConfig()
  const quote = await getQuoteWorkflowByRef(ref, roomTypeConfig)
  if (!quote) return <div className="p-10 text-center">Quote not found.</div>

  const serviceZones = getAssigneeServiceZones(config, assigneeId)
  const allowed = quote.inputs.city === assignee.city && (
    serviceZones.length === 0 || locationMatchesServiceZones(quote.inputs, quote.inputs.city, serviceZones)
  )
  if (!allowed) return <div className="p-10 text-center">This quote is outside your assigned service region.</div>

  const pricingConfig = await getQuotePricingConfig()
  const workflowApiPath = `/api/availability-agent/${encodeURIComponent(assigneeId)}/quotes/${encodeURIComponent(ref)}/workflow`
  const updatedQuoteApiPath = `/api/availability-agent/${encodeURIComponent(assigneeId)}/quotes/${encodeURIComponent(ref)}/send`

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AvailabilityAgentNav assigneeId={assignee.id} showLogout />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1a2744' }}>Quote Workbench</h1>
            <p className="mt-2 max-w-3xl text-gray-600">Review the original request, complete inspection notes, and prepare the working quote for your region.</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div className="font-mono font-semibold text-gray-700">{quote.quoteRef}</div>
            <div>Status: <span className="capitalize">{quote.status}</span></div>
          </div>
        </div>
        <QuoteWorkflowEditor
          quote={quote}
          pricingConfig={pricingConfig}
          roomTypeConfig={roomTypeConfig}
          workflowApiPath={workflowApiPath}
          canEmailScope={false}
          updatedQuoteApiPath={updatedQuoteApiPath}
          canEmailUpdatedQuote
        />
      </div>
    </div>
  )
}
