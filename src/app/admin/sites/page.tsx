import AdminPageHeader from '@/components/admin/AdminPageHeader'
import SitesManager from '@/components/admin/SitesManager'
import { withAdminPage } from '@/lib/adminPage'
import { getSites } from '@/lib/sites'

export const dynamic = 'force-dynamic'

export default async function AdminSitesPage() {
  return withAdminPage(async () => (
    <div>
      <AdminPageHeader title="Sites" description="Create and edit site records, access notes, and keyholder information." />
      <SitesManager initialSites={await getSites()} />
    </div>
  ))
}
