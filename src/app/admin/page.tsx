import AdminNav from '@/components/admin/AdminNav'
import AdminDashboard from '@/components/admin/AdminDashboard'
import { getAdminDashboardData } from '@/lib/adminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>
          Secure Cleaning Admin
        </h1>
        <p className="text-gray-600 mb-8 max-w-3xl">
          Use this single admin area to manage the live quoting, booking, content, pricing, and availability settings for the portal.
        </p>

        <AdminNav currentPath="/admin" />
        <AdminDashboard initialData={await getAdminDashboardData()} />
      </div>
    </div>
  )
}
