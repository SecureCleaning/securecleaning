import ContentAdmin from '@/components/admin/ContentAdmin'
import AdminNav from '@/components/admin/AdminNav'
import { CONTENT_DEFAULTS } from '@/lib/content'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  const initialEntries = CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <AdminNav currentPath="/admin/content" />
      </div>
      <ContentAdmin initialEntries={initialEntries} />
    </>
  )
}
