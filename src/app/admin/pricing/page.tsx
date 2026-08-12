import AdminNav from '@/components/admin/AdminNav'
import PricingAdmin from '@/components/admin/PricingAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getQuotePricingConfig } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export default async function AdminPricingPage() {
  return withAdminPage(async () => {
    const initialConfig = await getQuotePricingConfig()

    return (
      <>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/pricing" />
        </div>
        <PricingAdmin initialConfig={initialConfig} />
      </>
    )
  })
}
