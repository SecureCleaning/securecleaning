import ContentAdmin from '@/components/admin/ContentAdmin'
import AdminNav from '@/components/admin/AdminNav'
import { withAdminPage } from '@/lib/adminPage'
import { getAllContentEntries } from '@/lib/content'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  return withAdminPage(async () => {
    const initialEntries = await getAllContentEntries()

    return (
      <>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/content" />
        </div>
        <ContentAdmin initialEntries={initialEntries} />
      </>
    )
  })
}
