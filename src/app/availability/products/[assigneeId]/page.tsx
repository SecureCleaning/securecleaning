import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import ContractProductsWorkspace from '@/components/admin/ContractProductsWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'

export const dynamic = 'force-dynamic'

export default async function AvailabilityProductsPage({ params, searchParams }: {
  params: Promise<{ assigneeId: string }>
  searchParams?: Promise<{ product?: string | string[] }>
}) {
  const { assigneeId } = await params
  const resolvedSearchParams = await searchParams
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee?.active) return <div className="p-10 text-center">Agent not found.</div>
  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  const authenticated = Boolean(account?.active && account.role === 'agent' && account.availabilityAssigneeId === assigneeId)
  if (!authenticated) {
    return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/products/${assigneeId}`} />
  }
  return <div className="min-h-screen bg-gray-50 py-8"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><AvailabilityAgentNav assigneeId={assigneeId} showLogout /><ContractProductsWorkspace portal="agent" assigneeId={assigneeId} initialProductId={typeof resolvedSearchParams?.product === 'string' ? resolvedSearchParams.product : ''} /></div></div>
}
