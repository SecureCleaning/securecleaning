import MenuConfigurationEditor from '@/components/admin/MenuConfigurationEditor'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getMenuSettingsActor } from '@/lib/menuSettingsAuth'

export const dynamic = 'force-dynamic'
export default async function MenuConfigurationPage() {
  const actor = await getMenuSettingsActor(await getAdminSessionIdentityFromCookies())
  if (actor?.role !== 'owner') return <p className="rounded-xl border border-gray-200 bg-white p-6">Only an active owner can configure menus.</p>
  return <MenuConfigurationEditor />
}
