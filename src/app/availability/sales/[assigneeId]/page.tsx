import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import ContractSalesWorkspace from '@/components/admin/ContractSalesWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'

export const dynamic = 'force-dynamic'

export default async function AvailabilitySalesPage({ params, searchParams }: { params: Promise<{ assigneeId: string }>; searchParams?: Promise<{ product?: string | string[] }> }) {
  const { assigneeId } = await params
  const resolvedSearchParams = await searchParams
  const assignee = getAvailabilityAssignee(await getAvailabilityConfig(), assigneeId)
  if (!assignee?.active) return <div className="p-10 text-center">Agent not found.</div>
  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  if (!(account?.active && account.role === 'agent' && account.availabilityAssigneeId === assigneeId)) return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/sales/${assigneeId}`} />
  return <div className="min-h-screen bg-gray-50 py-8"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><AvailabilityAgentNav assigneeId={assigneeId} showLogout /><ContractSalesWorkspace portal="agent" assigneeId={assigneeId} initialProductId={typeof resolvedSearchParams?.product === 'string' ? resolvedSearchParams.product : ''} /></div></div>
}
