import AgentCleaners from '@/components/availability/AgentCleaners'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { hasAvailabilityAgentSession } from '@/lib/availabilityAgentAuth'
import { getStateForAvailabilityCity } from '@/lib/cleanerAgentPolicy'
import { getCleanerTemplates, searchAgentCleanerPage } from '@/lib/cleaners'

export const dynamic = 'force-dynamic'

export default async function AvailabilityCleanersPage({ params }: { params: Promise<{ assigneeId: string }> }) {
  const { assigneeId } = await params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  if (!assignee?.active) return <div className="p-10 text-center">Agent not found.</div>
  const authenticated = await hasAvailabilityAgentSession(assigneeId)
  if (!assignee.accessCodeHash && !authenticated) return <div className="p-10 text-center">Agent access is not configured yet.</div>
  if (!authenticated) {
    return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/cleaners/${assigneeId}`} />
  }

  const state = getStateForAvailabilityCity(assignee.city)
  if (!state) return <div className="p-10 text-center">Agent state is not supported.</div>
  const [result, templates] = await Promise.all([
    searchAgentCleanerPage({ state, page: 1, pageSize: 50 }),
    getCleanerTemplates(),
  ])

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <AvailabilityAgentNav assigneeId={assignee.id} showLogout />
        <AgentCleaners assigneeId={assignee.id} agentName={assignee.name} state={state} initialCleaners={result.cleaners} initialTemplates={templates} initialTotal={result.total} />
      </div>
    </div>
  )
}
