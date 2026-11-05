import AdminDashboard from '@/components/admin/AdminDashboard'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { getAdminDashboardData } from '@/lib/adminDashboard'
import { withAdminPage } from '@/lib/adminPage'
import { getAdminSessionIdentityFromCookies, hasAdminRole } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export default async function AdminQuotesPage() {
  return withAdminPage(async () => {
    const identity = await getAdminSessionIdentityFromCookies()
    return <div>
      <AdminPageHeader title="Quotes" description="Search, review and manage client quotes." showBack={false} />
      <AdminDashboard
        initialData={await getAdminDashboardData()}
        canDeleteQuotes={Boolean(identity && hasAdminRole(identity.role, 'owner'))}
      />
    </div>
  })
}
