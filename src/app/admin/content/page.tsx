import ContentAdmin from '@/components/admin/ContentAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getAllContentEntries } from '@/lib/content'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  return withAdminPage(async () => {
    const initialEntries = await getAllContentEntries()

    return <ContentAdmin initialEntries={initialEntries} />
  })
}
