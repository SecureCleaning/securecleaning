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
  const [dismissingSaleId, setDismissingSaleId] = useState('')
  const [dismissError, setDismissError] = useState('')
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
    window.addEventListener('secure-cleaning:sale-alerts-changed', loadSaleAlerts)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('secure-cleaning:sale-alerts-changed', loadSaleAlerts)
      controller.abort()
    }
  }, [assigneeId])

  async function dismissSaleAlert(saleId: string) {
    if (!assigneeId) return
    setDismissingSaleId(saleId)
    setDismissError('')
    try {
      const response = await fetch(`/api/availability-agent/${encodeURIComponent(assigneeId)}/sale-alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to dismiss alert.')
      setSaleAlerts((current) => current.filter((alert) => alert.saleId !== saleId))
    } catch (error) {
      setDismissError(error instanceof Error ? error.message : 'Unable to dismiss alert.')
    } finally {
      setDismissingSaleId('')
    }
  }

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
          <span className="block">
            {saleAlerts.length === 1
              ? `${saleAlerts[0].saleCode}${saleAlerts[0].productCode ? ` · ${saleAlerts[0].productCode}` : ''} is ready for the next step.`
              : `${saleAlerts.length} product sales have cleared deposits and are ready for the next step.`}
          </span>
          <span className="mt-1 block text-xs text-green-900">Sending the client availability request or scheduling the inspection clears the alert automatically. Dismiss it if follow-up was handled outside the system.</span>
          <div className="mt-2 space-y-2">
            {saleAlerts.map((alert) => (
              <div key={alert.saleId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-white/70 px-3 py-2">
                <span className="font-semibold">{alert.saleCode}{alert.productCode ? ` · ${alert.productCode}` : ''}</span>
                <span className="flex items-center gap-3">
                  <a href={`/availability/sales/${encodeURIComponent(assigneeId)}${alert.productId ? `?product=${encodeURIComponent(alert.productId)}` : ''}`} className="font-bold underline underline-offset-2">Open sale</a>
                  <button type="button" onClick={() => void dismissSaleAlert(alert.saleId)} disabled={Boolean(dismissingSaleId)} className="rounded-md border border-green-400 bg-white px-2.5 py-1 text-xs font-semibold text-green-900 disabled:opacity-50">{dismissingSaleId === alert.saleId ? 'Dismissing…' : 'Dismiss'}</button>
                </span>
              </div>
            ))}
          </div>
          {dismissError ? <span role="alert" className="mt-2 block text-xs font-semibold text-red-700">{dismissError}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
