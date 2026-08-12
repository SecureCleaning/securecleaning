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
        title="Secure Cleaning staff login"
        description="Sign in with your individual staff account to access the control panel."
      />
    )
  }

  return <AdminShell>{children}</AdminShell>
}
