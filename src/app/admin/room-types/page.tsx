import RoomTypeConfigAdmin from '@/components/admin/RoomTypeConfigAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export const dynamic = 'force-dynamic'

export default async function AdminRoomTypesPage() {
  return withAdminPage(async () => {
    const [initialConfig, pricingConfig] = await Promise.all([
      getQuoteRoomTypeConfig(),
      getQuotePricingConfig(),
    ])

    return <RoomTypeConfigAdmin initialConfig={initialConfig} pricingConfig={pricingConfig} />
  })
}
