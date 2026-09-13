import AdminPageHeader from '@/components/admin/AdminPageHeader'
import CleanerAccessAdmin from '@/components/admin/CleanerAccessAdmin'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminCleanerAccessPage() {
  return withAdminPage(async () => <><AdminPageHeader title="Cleaner portal invitations" description="Invite a new cleaner to register or send an existing cleaner a secure profile-update link." /><CleanerAccessAdmin /></>)
}
