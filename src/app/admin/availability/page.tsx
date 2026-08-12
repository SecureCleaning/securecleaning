import AdminNav from '@/components/admin/AdminNav'
import AvailabilityAdmin from '@/components/admin/AvailabilityAdmin'
import { getAvailabilityConfig } from '@/lib/availability'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminAvailabilityPage() {
  return withAdminPage(async () => {
    const initialConfig = await getAvailabilityConfig()

    return (
      <>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/availability" />
        </div>
        <AvailabilityAdmin initialConfig={initialConfig} />
      </>
    )
  })
}
