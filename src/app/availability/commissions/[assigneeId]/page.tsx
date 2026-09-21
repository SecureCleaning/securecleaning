import CommissionsWorkspace from '@/components/admin/CommissionsWorkspace'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
export const dynamic = 'force-dynamic'
export default async function AgentCommissionsPage({ params }: { params: Promise<{ assigneeId: string }> }) {
  const { assigneeId } = await params
  const assignee = getAvailabilityAssignee(await getAvailabilityConfig(), assigneeId)
  if (!assignee?.active) return <p>Agent not found.</p>
  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  if (!account?.active || account.role !== 'agent' || account.availabilityAssigneeId !== assigneeId) return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} redirectPath={`/availability/commissions/${assigneeId}`} />
  return <div className="mx-auto max-w-7xl px-4 py-8"><AvailabilityAgentNav assigneeId={assigneeId} showLogout /><CommissionsWorkspace /></div>
}
