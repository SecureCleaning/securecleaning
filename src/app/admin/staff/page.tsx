import StaffAccessAdmin from '@/components/admin/StaffAccessAdmin'
import { getAdminSessionIdentityFromCookies, hasAdminRole } from '@/lib/adminAuth'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminStaffPage() {
  return withAdminPage(async () => (
    await (async () => {
      const identity = await getAdminSessionIdentityFromCookies()
      if (!identity || !hasAdminRole(identity.role, 'owner')) {
        return (
          <div><h1 className="text-2xl font-bold" style={{ color: '#1a2744' }}>Staff access</h1><p className="mt-2 text-gray-600">Only an active owner can manage individual staff accounts and roles.</p></div>
        )
      }

      return <StaffAccessAdmin />
    })()
  ), 'Staff login required', 'Sign in with an individual staff account to continue.')
}
