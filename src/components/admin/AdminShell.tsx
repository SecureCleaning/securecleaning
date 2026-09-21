'use client'

import { useState } from 'react'
import { useSiteHeaderHeight } from '@/lib/useSiteHeaderHeight'
import { usePathname } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [isLocking, setIsLocking] = useState(false)
  const pathname = usePathname()
  const headerHeight = useSiteHeaderHeight()

  async function handleLock() {
    setIsLocking(true)
    try {
      await fetch('/api/admin/session', { method: 'DELETE' })
      window.location.reload()
    } finally {
      setIsLocking(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-[81px] z-40 border-b border-gray-200 bg-gray-50 shadow-sm md:top-[97px] print:static" style={headerHeight === null ? undefined : { top: headerHeight }}>
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <AdminNav currentPath={pathname} />
          <button
            type="button"
            onClick={handleLock}
            disabled={isLocking}
            className="min-h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60"
          >
            {isLocking ? 'Locking…' : 'Lock admin'}
          </button>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-5 lg:px-8">{children}</main>
    </div>
  )
}
