import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import ClientCrmWorkspace from '@/components/admin/ClientCrmWorkspace'
import SitesManager from '@/components/admin/SitesManager'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getSites } from '@/lib/sites'

export const dynamic = 'force-dynamic'

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams?: { opportunity?: string | string[]; view?: string | string[] }
}) {
  const identity = await getAdminSessionIdentityFromCookies()
  if (!identity || (identity.role !== 'owner' && identity.role !== 'manager')) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6"><h1 className="text-2xl font-bold text-gray-900">Client CRM</h1><p className="mt-2 text-gray-600">Owner or manager access is required. Regional agents use My clients from the agent portal.</p></div>
  }
  const opportunityId = typeof searchParams?.opportunity === 'string' ? searchParams.opportunity : ''
  const view = searchParams?.view === 'sites' ? 'sites' : 'crm'

  if (view === 'sites') {
    return (
      <div>
        <AdminPageHeader
          title="Client Sites"
          description="Manage the physical premises attached to client opportunities, including access, alarm, induction and keyholder details. Online bookings create or match these records automatically."
          backHref="/admin/clients"
          backLabel="Back to Client CRM"
          actions={(
            <Link href="/admin/clients" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-teal-300 hover:text-teal-700">
              Client CRM
            </Link>
          )}
        />
        <SitesManager initialSites={await getSites()} allowCreate={false} />
      </div>
    )
  }

  return <ClientCrmWorkspace initialOpportunityId={opportunityId} showSitesLink />
}
