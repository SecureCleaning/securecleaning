import TelemarketingAdmin from '@/components/admin/TelemarketingAdmin'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
export const dynamic = 'force-dynamic'
export default async function TelemarketingPage() {
  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role !== 'owner') return <p>Owner access is required to manage telemarketing accounts.</p>
  return <TelemarketingAdmin />
}
