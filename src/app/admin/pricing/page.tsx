import PricingAdmin from '@/components/admin/PricingAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getQuotePricingConfig } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export default async function AdminPricingPage() {
  return withAdminPage(async () => {
    const initialConfig = await getQuotePricingConfig()

    return <PricingAdmin initialConfig={initialConfig} />
  })
}
