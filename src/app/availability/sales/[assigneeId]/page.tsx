import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import AvailabilityAgentNav from '@/components/availability/AvailabilityAgentNav'
import ContractSalesWorkspace from '@/components/admin/ContractSalesWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'

export const dynamic = 'force-dynamic'

export default async function AvailabilitySalesPage({ params, searchParams }: { params: Promise<{ assigneeId: string }>; searchParams?: Promise<{ product?: string | string[]; sale?: string | string[]; invoice?: string | string[]; tab?: string | string[] }> }) {
  const { assigneeId } = await params
  const resolvedSearchParams = await searchParams
  const query = new URLSearchParams()
  for (const key of ['product', 'sale', 'invoice', 'tab'] as const) {
    const value = resolvedSearchParams?.[key]
    if (typeof value === 'string') query.set(key, value)
  }
  const assignee = getAvailabilityAssignee(await getAvailabilityConfig(), assigneeId)
  if (!assignee?.active) return <div className="p-10 text-center">Agent not found.</div>
  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  if (!(account?.active && account.role === 'agent' && account.availabilityAssigneeId === assigneeId)) return <AvailabilityAgentLogin assigneeId={assigneeId} assigneeName={assignee.name} defaultUsername={assignee.username ?? ''} lockUsername={Boolean(assignee.username)} redirectPath={`/availability/sales/${encodeURIComponent(assigneeId)}${query.size ? `?${query}` : ''}`} />
  return <div className="min-h-screen bg-gray-50 py-8"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><AvailabilityAgentNav assigneeId={assigneeId} showLogout /><ContractSalesWorkspace key={`${resolvedSearchParams?.sale ?? ""}:${resolvedSearchParams?.invoice ?? ""}`} portal="agent" assigneeId={assigneeId} initialProductId={typeof resolvedSearchParams?.product === 'string' ? resolvedSearchParams.product : ''} initialSaleId={typeof resolvedSearchParams?.sale === 'string' ? resolvedSearchParams.sale : ''} initialInvoiceId={typeof resolvedSearchParams?.invoice === 'string' ? resolvedSearchParams.invoice : ''} initialTab={resolvedSearchParams?.tab === 'invoices' ? 'invoices' : 'overview'} /></div></div>
}
