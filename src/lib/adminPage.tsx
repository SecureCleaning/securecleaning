import AdminLogin from '@/components/admin/AdminLogin'
import { getAdminSessionIdentityFromCookies, hasAdminSession } from '@/lib/adminAuth'
import Link from 'next/link'

export async function withAdminPage(
  renderPage: () => React.ReactNode | Promise<React.ReactNode>,
  title?: string,
  description = 'Sign in with your individual staff account to continue.'
) {
  const authenticated = await hasAdminSession()

  if (!authenticated) {
    return <AdminLogin title={title} description={description} />
  }

  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role === 'agent') {
    return (
      <div className="min-h-screen bg-gray-50 py-16">
        <div className="mx-auto max-w-xl px-4 text-center">
          <h1 className="mb-3 text-2xl font-bold" style={{ color: '#1a2744' }}>Regional agent access</h1>
          <p className="mb-6 text-gray-600">Use the agent portal to manage your regional quotes, bookings, and inspection calendar.</p>
          <Link href="/availability/login" className="inline-flex rounded-lg bg-green-600 px-5 py-3 font-semibold text-white">Open agent portal</Link>
        </div>
      </div>
    )
  }

  return await renderPage()
}
