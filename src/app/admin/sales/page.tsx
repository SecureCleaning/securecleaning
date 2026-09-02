import { redirect } from 'next/navigation'
import ContractSalesWorkspace from '@/components/admin/ContractSalesWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'

export const dynamic = 'force-dynamic'

export default async function AdminContractSalesPage({ searchParams }: { searchParams?: { product?: string | string[] } }) {
  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role === 'agent') {
    const account = await getStaffAccountProfileById(identity.id)
    const productId = typeof searchParams?.product === 'string' ? searchParams.product : ''
    if (account?.availabilityAssigneeId) redirect(`/availability/sales/${encodeURIComponent(account.availabilityAssigneeId)}${productId ? `?product=${encodeURIComponent(productId)}` : ''}`)
  }
  if (!identity || !['owner', 'manager'].includes(identity.role)) return <div className="rounded-xl border border-gray-200 bg-white p-6">Owner or manager access is required.</div>
  return <ContractSalesWorkspace initialProductId={typeof searchParams?.product === 'string' ? searchParams.product : ''} />
}
