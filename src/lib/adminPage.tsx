import AdminLogin from '@/components/admin/AdminLogin'
import { hasAdminSession } from '@/lib/adminAuth'

export async function withAdminPage(
  renderPage: () => React.ReactNode | Promise<React.ReactNode>,
  title?: string,
  description?: string
) {
  const authenticated = await hasAdminSession()

  if (!authenticated) {
    return <AdminLogin title={title} description={description} />
  }

  return await renderPage()
}
