import type { ReactNode } from 'react'
import AdminLogin from '@/components/admin/AdminLogin'
import AdminShell from '@/components/admin/AdminShell'
import { hasAdminSession } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authenticated = await hasAdminSession()

  if (!authenticated) {
    return (
      <AdminLogin
        title="Unlock admin"
        description="Enter the internal admin password to access the Secure Cleaning control panel."
      />
    )
  }

  return <AdminShell>{children}</AdminShell>
}
