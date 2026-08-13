import RoomTypeConfigAdmin from '@/components/admin/RoomTypeConfigAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export const dynamic = 'force-dynamic'

export default async function AdminRoomTypesPage() {
  return withAdminPage(async () => {
    const initialConfig = await getQuoteRoomTypeConfig()

    return <RoomTypeConfigAdmin initialConfig={initialConfig} />
  })
}
