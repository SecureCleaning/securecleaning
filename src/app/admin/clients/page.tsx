import ClientCrmWorkspace from '@/components/admin/ClientCrmWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams?: { opportunity?: string | string[] }
}) {
  const identity = await getAdminSessionIdentityFromCookies()
  if (!identity || (identity.role !== 'owner' && identity.role !== 'manager')) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6"><h1 className="text-2xl font-bold text-gray-900">Client CRM</h1><p className="mt-2 text-gray-600">Owner or manager access is required. Regional agents use My clients from the agent portal.</p></div>
  }
  const opportunityId = typeof searchParams?.opportunity === 'string' ? searchParams.opportunity : ''
  return <ClientCrmWorkspace initialOpportunityId={opportunityId} />
}
