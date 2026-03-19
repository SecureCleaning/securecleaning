import ContentAdmin from '@/components/admin/ContentAdmin'
import { CONTENT_DEFAULTS } from '@/lib/content'

export const dynamic = 'force-dynamic'

export default function AdminContentPage() {
  const initialEntries = CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))

  return <ContentAdmin initialEntries={initialEntries} />
}
