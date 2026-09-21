import CommissionsWorkspace from '@/components/admin/CommissionsWorkspace'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
export const dynamic = 'force-dynamic'
export default async function CommissionsPage() {
  const identity = await getAdminSessionIdentityFromCookies()
  const account = identity ? await getStaffAccountProfileById(identity.id) : null
  if (!account?.active || account.role !== 'owner') return <p>Owner access required.</p>
  return <CommissionsWorkspace />
}
