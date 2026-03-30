import AdminNav from '@/components/admin/AdminNav'
import SitesManager from '@/components/admin/SitesManager'
import { getSites } from '@/lib/sites'

export const dynamic = 'force-dynamic'

export default async function AdminSitesPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <AdminNav currentPath="/admin/sites" />
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>Sites</h1>
          <p className="text-gray-600">Create and edit site records, access notes, and keyholder information.</p>
        </div>
        <SitesManager initialSites={await getSites()} />
      </div>
    </div>
  )
}
