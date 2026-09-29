import SmsSettingsAdmin from '@/components/sms/SmsSettingsAdmin'
import { withAdminPage } from '@/lib/adminPage'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
export const dynamic='force-dynamic'
export default async function SmsSettingsPage() {
  return withAdminPage(async()=>{
    const identity=await getAdminSessionIdentityFromCookies()
    if(identity?.role!=='owner') return <p className="p-8">Owner access is required for SMS settings.</p>
    return <SmsSettingsAdmin/>
  })
}
