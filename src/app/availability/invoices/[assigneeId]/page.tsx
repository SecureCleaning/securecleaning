import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import InvoiceDirectory from '@/components/admin/InvoiceDirectory'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getMenuSettingsActor } from '@/lib/menuSettingsAuth'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'

export const dynamic = 'force-dynamic'
export default async function AgentInvoicesPage({ params }: { params: { assigneeId: string } }) {
  const { assigneeId } = params
  const actor = await getMenuSettingsActor(await getAdminSessionIdentityFromCookies())
  const assignee = getAvailabilityAssignee(await getAvailabilityConfig(), assigneeId)
  if (!assignee?.active) return <p className="p-10 text-center">Agent not found.</p>
  if (actor?.role !== 'agent' || actor.availabilityAssigneeId !== assigneeId) return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/invoices/${encodeURIComponent(assigneeId)}`} />
  return <div className="min-h-screen bg-gray-50 py-8"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><AvailabilityAgentNav assigneeId={assigneeId} showLogout /><InvoiceDirectory assigneeId={assigneeId} /></div></div>
}
