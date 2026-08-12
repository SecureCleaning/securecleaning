import AdminNav from '@/components/admin/AdminNav'
import RoomTypeConfigAdmin from '@/components/admin/RoomTypeConfigAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export const dynamic = 'force-dynamic'

export default async function AdminRoomTypesPage() {
  return withAdminPage(async () => {
    const initialConfig = await getQuoteRoomTypeConfig()

    return (
      <>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/room-types" />
        </div>
        <RoomTypeConfigAdmin initialConfig={initialConfig} />
      </>
    )
  })
}
