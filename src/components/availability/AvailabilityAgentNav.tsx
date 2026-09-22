'use client'

import { useEffect, useState } from 'react'
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
  const [saleAlerts, setSaleAlerts] = useState<Array<{
    saleId: string
    saleCode: string
    productId: string
    productCode: string
  }>>([])

  useEffect(() => {
    if (!assigneeId) {
      setSaleAlerts([])
      return
    }

    const controller = new AbortController()
    const loadSaleAlerts = async () => {
      try {
        const response = await fetch(`/api/availability-agent/${encodeURIComponent(assigneeId)}/sale-alerts`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const result = response.ok ? await response.json() : { alerts: [] }
        setSaleAlerts(Array.isArray(result.alerts) ? result.alerts : [])
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSaleAlerts([])
      }
    }
    void loadSaleAlerts()
    const interval = window.setInterval(() => void loadSaleAlerts(), 60_000)

    return () => {
      window.clearInterval(interval)
      controller.abort()
    }
  }, [assigneeId])

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
      {assigneeId && saleAlerts.length > 0 ? (
        <div role="status" aria-live="polite" className="mt-2 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-950 shadow-sm">
          <strong className="block">Cleared deposit approved</strong>
          <span>
            {saleAlerts.length === 1
              ? `${saleAlerts[0].saleCode}${saleAlerts[0].productCode ? ` · ${saleAlerts[0].productCode}` : ''} is ready for the next step.`
              : `${saleAlerts.length} product sales have cleared deposits and are ready for the next step.`}
          </span>{' '}
          <a
            href={`/availability/sales/${encodeURIComponent(assigneeId)}${saleAlerts.length === 1 && saleAlerts[0].productId ? `?product=${encodeURIComponent(saleAlerts[0].productId)}` : ''}`}
            className="font-bold underline underline-offset-2"
          >
            Open Product sales
          </a>
        </div>
      ) : null}
    </div>
  )
}
