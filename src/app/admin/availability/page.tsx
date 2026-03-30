import AdminNav from '@/components/admin/AdminNav'
import AvailabilityAdmin from '@/components/admin/AvailabilityAdmin'
import { DEFAULT_AVAILABILITY_CONFIG } from '@/lib/availability'

export const dynamic = 'force-dynamic'

export default async function AdminAvailabilityPage() {
  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <AdminNav currentPath="/admin/availability" />
      </div>
      <AvailabilityAdmin initialConfig={DEFAULT_AVAILABILITY_CONFIG} />
    </>
  )
}
