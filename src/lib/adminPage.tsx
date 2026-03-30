import AdminLogin from '@/components/admin/AdminLogin'
import AdminShell from '@/components/admin/AdminShell'
import { hasAdminSession } from '@/lib/adminAuth'

export async function withAdminPage(children: React.ReactNode, title?: string, description?: string) {
  const authenticated = await hasAdminSession()

  if (!authenticated) {
    return <AdminLogin title={title} description={description} />
  }

  return <AdminShell>{children}</AdminShell>
}
