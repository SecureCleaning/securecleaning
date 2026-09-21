import { redirect } from 'next/navigation'
import ContractSalesWorkspace from '@/components/admin/ContractSalesWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'

export const dynamic = 'force-dynamic'

export default async function AdminContractSalesPage({ searchParams }: { searchParams?: { product?: string | string[]; sale?: string | string[]; invoice?: string | string[]; tab?: string | string[] } }) {
  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role === 'agent') {
    const account = await getStaffAccountProfileById(identity.id)
    const query = new URLSearchParams()
    for (const key of ['product', 'sale', 'invoice', 'tab'] as const) {
      const value = searchParams?.[key]
      if (typeof value === 'string') query.set(key, value)
    }
    if (account?.availabilityAssigneeId) redirect(`/availability/sales/${encodeURIComponent(account.availabilityAssigneeId)}${query.size ? `?${query}` : ''}`)
  }
  if (!identity || !['owner', 'manager'].includes(identity.role)) return <div className="rounded-xl border border-gray-200 bg-white p-6">Owner or manager access is required.</div>
  return <ContractSalesWorkspace key={`${searchParams?.sale ?? ""}:${searchParams?.invoice ?? ""}`} initialProductId={typeof searchParams?.product === 'string' ? searchParams.product : ''} initialSaleId={typeof searchParams?.sale === 'string' ? searchParams.sale : ''} initialInvoiceId={typeof searchParams?.invoice === 'string' ? searchParams.invoice : ''} initialTab={searchParams?.tab === 'invoices' ? 'invoices' : 'overview'} />
}
