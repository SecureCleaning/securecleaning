import { redirect } from 'next/navigation'
import ContractProductsWorkspace from '@/components/admin/ContractProductsWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'

export const dynamic = 'force-dynamic'

export default async function AdminContractProductsPage({ searchParams }: { searchParams?: { product?: string | string[] } }) {
  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role === 'agent') {
    const account = await getStaffAccountProfileById(identity.id)
    if (account?.availabilityAssigneeId) redirect(`/availability/products/${encodeURIComponent(account.availabilityAssigneeId)}`)
  }
  if (!identity || !['owner', 'manager'].includes(identity.role)) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6">Owner or manager access is required.</div>
  }
  return <ContractProductsWorkspace initialProductId={typeof searchParams?.product === 'string' ? searchParams.product : ''} />
}
