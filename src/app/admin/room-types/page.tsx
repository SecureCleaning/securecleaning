import RoomTypeConfigAdmin from '@/components/admin/RoomTypeConfigAdmin'
import PricingAdmin from '@/components/admin/PricingAdmin'
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

    return <>
      <RoomTypeConfigAdmin initialConfig={initialConfig} pricingConfig={pricingConfig} />
      <details className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-bold text-gray-900">Advanced quote-wide rules</summary>
        <p className="mt-2 text-sm text-gray-600">Use these less often: hourly labour, minimum invoice, multipliers, and global add-ons.</p>
        <div className="mt-5 border-t border-gray-100 pt-5">
          <PricingAdmin initialConfig={pricingConfig} embedded />
        </div>
      </details>
    </>
  })
}
