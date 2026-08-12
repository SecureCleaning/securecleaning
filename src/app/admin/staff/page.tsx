import AdminNav from '@/components/admin/AdminNav'
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
          <div className="min-h-screen bg-gray-50 py-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-3xl font-bold mb-3" style={{ color: '#1a2744' }}>Staff access</h1>
              <p className="text-gray-600">Only an active owner can manage individual staff accounts and roles.</p>
            </div>
          </div>
        )
      }

      return (
        <>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
            <AdminNav currentPath="/admin/staff" />
          </div>
          <StaffAccessAdmin />
        </>
      )
    })()
  ), 'Staff login required', 'Sign in with an individual staff account to continue.')
}
