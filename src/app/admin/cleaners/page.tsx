import AdminNav from '@/components/admin/AdminNav'
import CleanersAdmin from '@/components/admin/CleanersAdmin'
import { getCleanerAdminData } from '@/lib/cleaners'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminCleanersPage() {
  return withAdminPage(async () => {
    const data = await getCleanerAdminData()

    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AdminNav currentPath="/admin/cleaners" />
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>
              Cleaner Database
            </h1>
            <p className="text-gray-600 max-w-3xl">
              Keep searchable cleaner records, contact details, compliance notes, staff comments, and email history in one admin area.
            </p>
          </div>
          <CleanersAdmin
            initialCleaners={data.cleaners}
            initialTotal={data.total}
            initialPage={data.page}
            initialPageSize={data.pageSize}
            initialTemplates={data.templates}
            initialSelected={data.selected}
          />
        </div>
      </div>
    )
  })
}
