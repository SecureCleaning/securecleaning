import CleanersAdmin from '@/components/admin/CleanersAdmin'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { getCleanerAdminData } from '@/lib/cleaners'
import { withAdminPage } from '@/lib/adminPage'
import CleanerAccessAdmin from '@/components/admin/CleanerAccessAdmin'

export const dynamic = 'force-dynamic'

export default async function AdminCleanersPage() {
  return withAdminPage(async () => {
    const data = await getCleanerAdminData()

    return (
      <div className="-mx-0">
        <AdminPageHeader title="Cleaner Database" description="Search and manage cleaner records, compliance notes, staff comments, and email history." />
        <div className="mb-6"><CleanerAccessAdmin /></div>
        <CleanersAdmin
          initialCleaners={data.cleaners}
          initialTotal={data.total}
          initialPage={data.page}
          initialPageSize={data.pageSize}
          initialTemplates={data.templates}
          initialSelected={data.selected}
        />
      </div>
    )
  })
}
