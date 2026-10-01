import { parseDashboardWeekOffset } from '@/lib/agentDashboardPolicy'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import AgentPortalDashboard from '@/components/availability/AgentPortalDashboard'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getAgentDashboardData } from '@/lib/agentDashboard'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { getContractProductStateForCity } from '@/lib/contractProductPolicy'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'

export const dynamic = 'force-dynamic'

export default async function AgentDashboardPage({ params, searchParams }: { params: Promise<{ assigneeId: string }>; searchParams?: Promise<{ week?: string | string[] }> }) {
  const { assigneeId } = await params
  const weekOffset = parseDashboardWeekOffset((await searchParams)?.week)
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee?.active) return <div className="p-10 text-center">Agent not found.</div>

  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  const authenticated = Boolean(
    account?.active
    && account.role === 'agent'
    && account.username === identity?.username
    && account.availabilityAssigneeId === assigneeId,
  )
  if (!authenticated || !account) {
    return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/dashboard/${encodeURIComponent(assigneeId)}`} />
  }

  const productState = getContractProductStateForCity(assignee.city)
  if (!productState) return <div className="p-10 text-center">This agent region is not configured for product sales.</div>
  const actor: ContractProductActor = { ...account, role: 'agent', productState }
  const data = await getAgentDashboardData(actor, config, assignee, weekOffset)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AvailabilityAgentNav assigneeId={assigneeId} showLogout />
        <AgentPortalDashboard assigneeId={assigneeId} agentName={account.displayName || assignee.name} city={assignee.city} data={data} />
      </div>
    </div>
  )
}
