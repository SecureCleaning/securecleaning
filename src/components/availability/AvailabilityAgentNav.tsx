'use client'

import { useState } from 'react'
import { useSiteHeaderHeight } from '@/lib/useSiteHeaderHeight'
import { usePathname } from 'next/navigation'
import ConfigurableNavigation from '@/components/navigation/ConfigurableNavigation'
import { useNavigationMenu } from '@/lib/useNavigationMenu'

export default function AvailabilityAgentNav({
  assigneeId,
  showLogout = false,
  containerClassName,
}: {
  assigneeId?: string
  showLogout?: boolean
  containerClassName?: string
}) {
  const headerHeight = useSiteHeaderHeight()
  const pathname = usePathname()
  const menu = useNavigationMenu('agent', assigneeId)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      await fetch('/api/availability-agent/session', { method: 'DELETE' })
      await fetch('/api/admin/session', { method: 'DELETE' })
    } finally {
      window.location.assign('/agent')
    }
  }

  return (
    <div className={`sticky top-[81px] z-40 mb-8 md:top-[97px] print:static ${containerClassName ?? ''}`} style={headerHeight === null ? undefined : { top: headerHeight }}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
      >
        <ConfigurableNavigation {...menu} currentPath={pathname} label="Agent portal navigation" />
        {showLogout ? (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-400 disabled:cursor-wait disabled:opacity-60"
          >
            {isLoggingOut ? 'Logging out...' : 'Log out'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
