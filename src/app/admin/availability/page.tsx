import AvailabilityAdmin from '@/components/admin/AvailabilityAdmin'
import { getAvailabilityConfig } from '@/lib/availability'
import { withAdminPage } from '@/lib/adminPage'
import { getAdminSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function AdminAvailabilityPage() {
  return withAdminPage(async () => {
    const initialConfig = await getAvailabilityConfig()
    const db = getAdminSupabase()
    const { data: ownerOperators } = await db
      .from('owner_operators')
      .select('id, business_name, operator_name, city, is_active')
      .order('business_name', { ascending: true })

    return <AvailabilityAdmin initialConfig={initialConfig} ownerOperators={ownerOperators ?? []} />
  })
}
