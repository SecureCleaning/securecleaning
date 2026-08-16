import AgentQuoteDashboard, { type AgentQuoteRow } from '@/components/availability/AgentQuoteDashboard'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { hasAvailabilityAgentSession } from '@/lib/availabilityAgentAuth'
import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AvailabilityQuotesPage({ params }: { params: Promise<{ assigneeId: string }> }) {
  const { assigneeId } = await params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  if (!assignee) return <div className="p-10 text-center">Agent not found.</div>
  const authenticated = await hasAvailabilityAgentSession(assigneeId)
  if (!assignee.accessCodeHash && !authenticated) return <div className="p-10 text-center">Agent access is not configured yet.</div>

  if (!authenticated) {
    return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/quotes/${assigneeId}`} />
  }

  const { data, error } = await getAdminSupabase()
    .from('quotes')
    .select('quote_ref, status, created_at, inputs')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) console.error('[availabilityQuotes] quote load failed:', error)

  const serviceZones = getAssigneeServiceZones(config, assigneeId)
  const hasConfiguredZones = serviceZones.length > 0
  const quotes: AgentQuoteRow[] = (data ?? []).flatMap((row) => {
    const inputs = row.inputs as QuoteInputs | undefined
    if (!inputs || inputs.city !== assignee.city) return []
    if (hasConfiguredZones && !locationMatchesServiceZones(inputs, inputs.city, serviceZones)) return []
    return [{
      quoteRef: row.quote_ref,
      status: row.status,
      createdAt: row.created_at,
      businessName: inputs.businessName || '',
      contactName: inputs.contactName || '',
      city: inputs.city,
      suburb: inputs.suburb || '',
      postcode: inputs.postcode || '',
      premisesType: inputs.premisesType,
      frequency: inputs.frequency,
    }]
  })

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><AvailabilityAgentNav assigneeId={assignee.id} showLogout /></div>
      <AgentQuoteDashboard assigneeId={assignee.id} assigneeName={assignee.name} city={assignee.city} quotes={quotes} />
    </div>
  )
}
