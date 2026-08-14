import AdminDashboard from '@/components/admin/AdminDashboard'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { getAdminDashboardData } from '@/lib/adminDashboard'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  return withAdminPage(async () => (
    <div>
      <AdminPageHeader
        title="Secure Cleaning Admin"
        description="Manage live quoting, booking, content, pricing, and availability settings for the portal."
        showBack={false}
      />
      <AdminDashboard initialData={await getAdminDashboardData()} />
    </div>
  ))
}
