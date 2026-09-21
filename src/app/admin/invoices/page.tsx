import { redirect } from 'next/navigation'
import InvoiceDirectory from '@/components/admin/InvoiceDirectory'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getMenuSettingsActor } from '@/lib/menuSettingsAuth'

export const dynamic = 'force-dynamic'
export default async function AdminInvoicesPage() {
  const actor = await getMenuSettingsActor(await getAdminSessionIdentityFromCookies())
  if (actor?.role === 'agent' && actor.availabilityAssigneeId) redirect(`/availability/invoices/${encodeURIComponent(actor.availabilityAssigneeId)}`)
  if (!actor || !['owner', 'manager'].includes(actor.role)) return <p className="rounded-xl border border-gray-200 bg-white p-6">Owner or manager access is required.</p>
  return <InvoiceDirectory />
}
