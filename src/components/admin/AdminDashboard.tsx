'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuoteListRefresh } from '@/lib/useQuoteListRefresh'
import BookingEditor from './BookingEditor'
import DispatchPanel from './DispatchPanel'
import CrmFollowUpPanel from './CrmFollowUpPanel'
import ReportingPanel from './ReportingPanel'
import AlertsPanel from './AlertsPanel'
import DeleteQuoteButton from './DeleteQuoteButton'
import { getRelevantOperators } from '@/lib/operatorMatching'

type DashboardStats = {
  quotesPending: number
  bookingsPending: number
  clientsTotal: number
  ownerOperatorsActive: number
  leadsTotal: number
}

type QuoteRow = {
  id: string
  quote_ref: string
  status: string
  valid_until?: string | null
  created_at?: string | null
  follow_up_status?: string | null
  follow_up_notes?: string | null
  inputs?: {
    businessName?: string
    city?: string
    email?: string
    premisesType?: string
    frequency?: string
  }
}

type BookingRow = {
  id: string
  booking_ref: string
  status: string
  first_clean_date?: string | null
  created_at?: string | null
  site_id?: string | null
  assigned_operator_id?: string | null
  linkedAgentId?: string | null
  linkedOperatorId?: string | null
  inspection_status?: string | null
  inspection_scheduled_for?: string | null
  inspection_completed_at?: string | null
  dispatch_notes?: string | null
  inputs?: {
    businessName?: string
    city?: string
    email?: string
    address?: string
    suburb?: string
    postcode?: string
    frequency?: string
    premisesType?: string
    contactName?: string
    phone?: string
    preferredStartDate?: string
    preferredInspectionSlotLabel?: string
    preferredInspectionAssigneeId?: string
    preferredInspectionAssigneeName?: string
    notes?: string
  }
}

type ClientRow = {
  id: string
  business_name: string
  contact_name: string
  email: string
  city?: string | null
  created_at?: string | null
}

type LeadRow = {
  id: string
  email: string
  business_name?: string | null
  city?: string | null
  source?: string | null
  created_at?: string | null
  follow_up_status?: string | null
  follow_up_notes?: string | null
}

type OperatorRow = {
  id: string
  business_name: string
  operator_name: string
  city: string
  is_verified: boolean
  is_active: boolean
  premises_types?: string[] | null
  availabilityAssigneeId?: string | null
}

type AvailabilityAgentRow = {
  id: string
  name: string
  city: string
  active: boolean
  ownerOperatorId?: string | null
}

type SiteRow = {
  id: string
  site_name?: string | null
  address: string
  suburb?: string | null
  postcode?: string | null
  city: string
  premises_type?: string | null
  floor_area?: number | null
  keyholder_name?: string | null
  keyholder_phone?: string | null
  is_active: boolean
}

type ReportingSnapshot = {
  quoteCount: number
  bookingCount: number
  pendingBookings: number
  completedBookings: number
  activeOperators: number
  unassignedBookings: number
  scheduledInspections: number
  quoteFollowUpBreakdown: Record<string, number>
  leadFollowUpBreakdown: Record<string, number>
}

type AdminAlertRow = {
  id: string
  entity_ref: string
  kind: string
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}

type AuditLogRow = {
  id: string
  entity_type: string
  entity_ref: string
  action: string
  details: Record<string, unknown>
  created_at: string
}

export interface AdminDashboardData {
  stats: DashboardStats
  quotes: QuoteRow[]
  bookings: BookingRow[]
  clients: ClientRow[]
  leads: LeadRow[]
  operators: OperatorRow[]
  availabilityAgents: AvailabilityAgentRow[]
  sites: SiteRow[]
  overview: {
    reporting: ReportingSnapshot
    alerts: AdminAlertRow[]
    auditLog: AuditLogRow[]
  }
}

interface Props {
  initialData: AdminDashboardData
  canDeleteQuotes?: boolean
}

const tabs = [
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'leads', label: 'Leads' },
] as const

type TabKey = (typeof tabs)[number]['key']

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const quoteStatuses = ['pending', 'sent', 'accepted', 'expired', 'declined']
const bookingStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']

export default function AdminDashboard({ initialData, canDeleteQuotes = false }: Props) {
  useQuoteListRefresh()
  useEffect(() => setQuotes(initialData.quotes), [initialData.quotes])
  const [activeTab, setActiveTab] = useState<TabKey>('quotes')
  const [quotes, setQuotes] = useState(initialData.quotes)
  const [quoteSearch, setQuoteSearch] = useState('')
  const [quotePage, setQuotePage] = useState(0)
  const matchingQuotes = quotes.filter((quote) => [quote.quote_ref, quote.inputs?.businessName, quote.inputs?.city].join(' ').toLowerCase().includes(quoteSearch.trim().toLowerCase()))
  const lastQuotePage = Math.max(0, Math.ceil(matchingQuotes.length / 25) - 1)
  const currentQuotePage = Math.min(quotePage, lastQuotePage)
  const visibleQuotes = matchingQuotes.slice(currentQuotePage * 25, (currentQuotePage + 1) * 25)
  const [bookings, setBookings] = useState(initialData.bookings)
  const [selectedBookingRef, setSelectedBookingRef] = useState(initialData.bookings[0]?.booking_ref ?? '')
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [leads, setLeads] = useState(initialData.leads)
  const [reportingSnapshot, setReportingSnapshot] = useState(initialData.overview.reporting)
  const [alerts, setAlerts] = useState(initialData.overview.alerts)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [sites] = useState(initialData.sites)
  const [operators] = useState(initialData.operators)
  const [actionState, setActionState] = useState<{ loading: string | null; message: string | null; error: string | null }>({
    loading: null,
    message: null,
    error: null,
  })

  useEffect(() => {
    if (!alertsOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAlertsOpen(false)
    }

    const desktopLayout = window.matchMedia('(min-width: 1280px)')
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setAlertsOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    desktopLayout.addEventListener('change', closeOnDesktop)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      desktopLayout.removeEventListener('change', closeOnDesktop)
    }
  }, [alertsOpen])

  function openWorkArea(nextTab: TabKey) {
    setActiveTab(nextTab)
    window.setTimeout(() => {
      const workArea = document.getElementById('admin-workarea')
      workArea?.focus({ preventScroll: true })
      workArea?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function openBookingEditor(bookingRef: string, alertId?: string) {
    setSelectedBookingRef(bookingRef)
    setSelectedAlertId(alertId ?? null)
    setActiveTab('bookings')
    window.setTimeout(() => {
      document.getElementById('booking-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function openDispatchEditor(bookingRef: string, alertId?: string) {
    setSelectedBookingRef(bookingRef)
    setSelectedAlertId(alertId ?? null)
    setActiveTab('bookings')
    window.setTimeout(() => {
      document.getElementById('dispatch-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function openAlert(alert: AdminAlertRow) {
    setAlertsOpen(false)

    if (alert.kind === 'new_quote') {
      window.location.assign(`/admin/quotes/${encodeURIComponent(alert.entity_ref)}`)
      return
    }

    if (alert.kind === 'new_booking') {
      openBookingEditor(alert.entity_ref, alert.id)
      return
    }

    openDispatchEditor(alert.entity_ref, alert.id)
  }

  async function dismissAlert(alert: AdminAlertRow) {
    const ok = await runAction(
      { action: 'alert.dismiss', alertId: alert.id },
      'Alert dismissed.'
    )
    if (!ok) return

    setAlerts((current) => current.filter((item) => item.id !== alert.id))
  }
  async function refreshOverview() {
    try {
      const [reportingResponse, alertsResponse] = await Promise.all([
        fetch('/api/admin/reporting'),
        fetch('/api/admin/alerts'),
      ])

      const [reportingResult, alertsResult] = await Promise.all([
        reportingResponse.json(),
        alertsResponse.json(),
      ])

      if (reportingResponse.ok && reportingResult?.success) {
        setReportingSnapshot(reportingResult.snapshot as ReportingSnapshot)
      }

      if (alertsResponse.ok && alertsResult?.success) {
        setAlerts(alertsResult.alerts as AdminAlertRow[])
      }
    } catch {
      // Leave the last known overview state in place if refresh fails.
    }
  }

  async function runAction(payload: Record<string, string>, successMessage: string) {
    setActionState({ loading: JSON.stringify(payload), message: null, error: null })

    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Action failed.')
      }

      setActionState({ loading: null, message: successMessage, error: null })
      return true
    } catch (error) {
      setActionState({
        loading: null,
        message: null,
        error: error instanceof Error ? error.message : 'Action failed.',
      })
      return false
    }
  }

  async function handleQuoteStatusChange(quoteRef: string, status: string) {
    const ok = await runAction({ action: 'quote.status', quoteRef, status }, `Quote ${quoteRef} updated to ${status}.`)
    if (!ok) return

    setQuotes((current) => current.map((quote) => (quote.quote_ref === quoteRef ? { ...quote, status } : quote)))
    void refreshOverview()
  }

  async function handleBookingStatusChange(bookingRef: string, status: string) {
    const ok = await runAction({ action: 'booking.status', bookingRef, status }, `Booking ${bookingRef} updated to ${status}.`)
    if (!ok) return

    setBookings((current) => current.map((booking) => (booking.booking_ref === bookingRef ? { ...booking, status } : booking)))
    void refreshOverview()
  }

  async function handleQuoteResend(quoteRef: string) {
    await runAction({ action: 'quote.resend', quoteRef }, `Quote email resent for ${quoteRef}.`)
  }

  async function handleBookingResend(bookingRef: string) {
    await runAction({ action: 'booking.resend', bookingRef }, `Booking email resent for ${bookingRef}.`)
  }

  async function handleBookingSiteChange(bookingRef: string, siteId: string) {
    const ok = await runAction(
      { action: 'booking.assignSite', bookingRef, siteId },
      `Booking ${bookingRef} site assignment updated.`
    )
    if (!ok) return

    setBookings((current) => current.map((booking) => (
      booking.booking_ref === bookingRef ? { ...booking, site_id: siteId || null } : booking
    )))
    void refreshOverview()
  }

  async function handleBookingOperatorChange(bookingRef: string, operatorId: string) {
    const ok = await runAction(
      { action: 'booking.assignOperator', bookingRef, operatorId },
      `Booking ${bookingRef} operator assignment updated.`
    )
    if (!ok) return

    setBookings((current) => current.map((booking) => {
      if (booking.booking_ref !== bookingRef) return booking

      const inputAssigneeId = booking.inputs?.preferredInspectionAssigneeId ?? null
      const selectedOperatorAssigneeId = operators.find((operator) => operator.id === operatorId)?.availabilityAssigneeId ?? null
      const linkedAgentId = inputAssigneeId ?? selectedOperatorAssigneeId
      const linkedOperatorId = operatorId
        ? null
        : operators.find((operator) => operator.availabilityAssigneeId === inputAssigneeId)?.id ?? null

      return {
        ...booking,
        assigned_operator_id: operatorId || null,
        linkedAgentId,
        linkedOperatorId,
      }
    }))
    void refreshOverview()
  }

  async function handleBookingAgentChange(bookingRef: string, agentId: string) {
    const ok = await runAction(
      { action: 'booking.assignAgent', bookingRef, agentId },
      `Booking ${bookingRef} inspection agent assignment updated.`
    )
    if (!ok) return

    const agent = initialData.availabilityAgents.find((item) => item.id === agentId)
    setBookings((current) => current.map((booking) => (
      booking.booking_ref === bookingRef
        ? {
            ...booking,
            inputs: {
              ...booking.inputs,
              preferredInspectionAssigneeId: agentId || undefined,
              preferredInspectionAssigneeName: agent?.name,
            },
            assigned_operator_id: agentId ? null : booking.assigned_operator_id,
            linkedAgentId: agentId || null,
          }
        : booking
    )))
    void refreshOverview()
  }

  const pendingQuoteCount = quotes.filter((quote) => quote.status === 'pending').length
  const criticalAlertCount = alerts.filter((alert) => alert.severity === 'critical').length

  function tabCount(tab: TabKey) {
    if (tab === 'quotes') return quotes.length
    if (tab === 'bookings') return bookings.length
    return leads.length
  }

  return (
    <div className="space-y-4">
      <section aria-label="Operations overview" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(17rem,1.15fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">Quote priority</div>
              <div className="mt-0.5 text-2xl font-bold leading-tight" style={{ color: '#1a2744' }}>
                {pendingQuoteCount} pending {pendingQuoteCount === 1 ? 'quote' : 'quotes'}
              </div>
              <p className="mt-0.5 text-xs text-gray-600">New enquiries waiting for review.</p>
            </div>
            <button type="button" onClick={() => openWorkArea('quotes')} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
              Open queue
            </button>
          </div>
          <ReportingPanel snapshot={reportingSnapshot} onMetricClick={openWorkArea} />
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-gray-50/70 px-3 py-2" aria-label="Admin shortcuts">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Quick access</span>
          <Link href="/admin/clients" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Client CRM</Link>
          <Link href="/admin/clients?view=sites" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Client sites</Link>
          <Link href="/admin/products" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Contract products</Link>
          <Link href="/admin/sales" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Product sales</Link>
          <Link href="/admin/calendar" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Calendar</Link>
          <Link href="/admin/availability" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white hover:text-green-700">Inspection availability</Link>
        </nav>
      </section>

      {actionState.message ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {actionState.message}
        </div>
      ) : null}
      {actionState.error ? (
        <div role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionState.error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div id="admin-workarea" tabIndex={-1} className="min-w-0 scroll-mt-24 focus:outline-none">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Dashboard work queues">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => openWorkArea(tab.key)}
                  aria-selected={isActive}
                  role="tab"
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-green-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {tabCount(tab.key)}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            aria-controls="admin-alert-drawer"
            aria-expanded={alertsOpen}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 xl:hidden"
          >
            Actions
            <span className="rounded-full bg-blue-900 px-2 py-0.5 text-xs text-white">{alerts.length}</span>
            {criticalAlertCount > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{criticalAlertCount} critical</span>
            ) : null}
          </button>
        </div>

        {activeTab === 'quotes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quotes</h2>
              <label className="mt-3 block text-sm">Search all quotes
                <input value={quoteSearch} onChange={(event) => { setQuoteSearch(event.target.value); setQuotePage(0) }} placeholder="Reference, business or city" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">Business</th>
                    <th className="px-3 py-2 text-left">City</th>
                    <th className="px-3 py-2 text-left">Frequency</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuotes.map((quote) => (
                    <tr key={quote.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 font-mono">
                        <div>{quote.quote_ref}</div>
                        <div className="text-xs text-gray-500 mt-1">{formatDate(quote.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">{quote.inputs?.businessName ?? '—'}</td>
                      <td className="px-3 py-2 capitalize">{quote.inputs?.city ?? '—'}</td>
                      <td className="px-3 py-2">{quote.inputs?.frequency?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={quote.status}
                          onChange={(event) => handleQuoteStatusChange(quote.quote_ref, event.target.value)}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                        >
                          {quoteStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex min-w-max flex-nowrap items-center gap-1.5 whitespace-nowrap">
                          <a
                            href={`/admin/quotes/${quote.quote_ref}`}
                            className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-center text-xs font-semibold text-green-700 hover:border-green-300"
                          >
                            Workbench
                          </a>
                          <button
                            type="button"
                            onClick={() => handleQuoteResend(quote.quote_ref)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Resend
                          </button>
                          <a
                            href={`/quote/${quote.quote_ref}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-center text-xs font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Preview
                          </a>
                          {canDeleteQuotes ? (
                            <DeleteQuoteButton
                              quoteRef={quote.quote_ref}
                              onDeleted={(quoteRef) => {
                                setQuotes((current) => current.filter((item) => item.quote_ref !== quoteRef))
                                setAlerts((current) => current.filter((item) => item.entity_ref !== quoteRef))
                                setActionState({ loading: null, message: `Quote ${quoteRef} was permanently deleted.`, error: null })
                                void refreshOverview()
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{matchingQuotes.length} matching quotes · Page {currentQuotePage + 1} of {lastQuotePage + 1}</span>
            <div className="flex gap-2">
              <button type="button" disabled={currentQuotePage === 0} onClick={() => setQuotePage(currentQuotePage - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button>
              <button type="button" disabled={currentQuotePage >= lastQuotePage} onClick={() => setQuotePage(currentQuotePage + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button>
            </div>
          </div>
          <CrmFollowUpPanel
            section="quotes"
            quotes={quotes}
            leads={leads}
            onQuoteUpdated={(quoteRef, updates) => {
              setQuotes((current) => current.map((quote) => (
                quote.quote_ref === quoteRef ? { ...quote, ...updates } : quote
              )))
              void refreshOverview()
            }}
          />
        </div>
        )}

        {activeTab === 'bookings' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Booking queue</h2>
                  <p className="mt-1 text-sm text-gray-600">Open a booking to edit customer details, inspection workflow, or assignments.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{bookings.length} shown</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">Locality</th>
                    <th className="px-4 py-3 text-left">Frequency</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Site</th>
                    <th className="px-4 py-3 text-left">Operator</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const linkedAgentId = booking.linkedAgentId
                      ?? booking.inputs?.preferredInspectionAssigneeId
                      ?? operators.find((operator) => operator.id === booking.assigned_operator_id)?.availabilityAssigneeId

                    return (
                    <tr id={`booking-row-${booking.booking_ref}`} key={booking.id} className="border-t border-gray-100 align-top scroll-mt-24">
                      <td className="px-4 py-3 font-mono">
                        <div>{booking.booking_ref}</div>
                        <div className="text-xs text-gray-500 mt-1">{formatDate(booking.first_clean_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{booking.inputs?.businessName ?? '—'}</div>
                        {booking.inputs?.preferredInspectionAssigneeName ? (
                          <div className="text-xs text-gray-500 mt-1">
                            Quoter: {booking.inputs.preferredInspectionAssigneeName}
                          </div>
                        ) : null}
                        {booking.inputs?.preferredInspectionSlotLabel ? (
                          <div className="text-xs text-gray-500 mt-1">
                            Window: {booking.inputs.preferredInspectionSlotLabel}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="capitalize">{booking.inputs?.city ?? '—'}</div>
                        {(booking.inputs?.suburb || booking.inputs?.postcode) ? (
                          <div className="text-xs text-gray-500 mt-1">
                            {[booking.inputs?.suburb, booking.inputs?.postcode].filter(Boolean).join(' ')}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{booking.inputs?.frequency?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={booking.status}
                          onChange={(event) => handleBookingStatusChange(booking.booking_ref, event.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          {bookingStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={booking.site_id ?? ''}
                          onChange={(event) => handleBookingSiteChange(booking.booking_ref, event.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Unassigned</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>{site.site_name || site.address}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <select
                            value={booking.assigned_operator_id ?? ''}
                            onChange={(event) => handleBookingOperatorChange(booking.booking_ref, event.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                          >
                            <option value="">Unassigned</option>
                            {getRelevantOperators(
                              operators,
                              booking.inputs?.city,
                              booking.inputs?.premisesType
                            ).map((operator) => (
                              <option key={operator.id} value={operator.id}>{operator.business_name} — {operator.operator_name}</option>
                            ))}
                          </select>
                          {booking.assigned_operator_id ? (
                            <div className="text-xs text-gray-500">
                              {operators.find((operator) => operator.id === booking.assigned_operator_id)?.availabilityAssigneeId
                                ? 'Linked to inspection agent'
                                : 'No inspection agent linked'}
                            </div>
                          ) : booking.linkedOperatorId ? (
                            <div className="space-y-1 text-xs text-blue-700">
                              <div>Inspection agent linked to {operators.find((operator) => operator.id === booking.linkedOperatorId)?.business_name ?? 'an owner-operator'}.</div>
                              <button
                                type="button"
                                onClick={() => handleBookingOperatorChange(booking.booking_ref, booking.linkedOperatorId as string)}
                                className="font-semibold underline underline-offset-2 hover:text-blue-900"
                              >
                                Assign linked operator
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[11rem] flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openBookingEditor(booking.booking_ref)}
                            className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-center text-xs font-semibold text-green-700 hover:border-green-300"
                          >
                            Booking
                          </button>
                          <button
                            type="button"
                            onClick={() => openDispatchEditor(booking.booking_ref)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-center text-xs font-semibold text-blue-800 hover:border-blue-300"
                          >
                            Workflow
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBookingResend(booking.booking_ref)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Resend
                          </button>
                          {linkedAgentId ? (
                            <a
                              href={`/admin/availability/quoters/${encodeURIComponent(linkedAgentId)}`}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-center text-xs font-semibold text-blue-800 hover:border-blue-300"
                            >
                              Agent schedule
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div id="booking-editor" className="scroll-mt-24">
            <BookingEditor
              bookings={bookings}
              selectedBookingRef={selectedBookingRef}
              onSelectedBookingRefChange={setSelectedBookingRef}
              onBookingUpdated={(updatedBooking) => {
                setBookings((current) => current.map((booking) => (
                  booking.booking_ref === updatedBooking.booking_ref ? updatedBooking : booking
                )))
                void refreshOverview()
              }}
              selectedAlertId={
                selectedAlertId?.startsWith('booking-unassigned-') || selectedAlertId?.startsWith('booking-overdue-')
                  ? null
                  : selectedAlertId
              }
              onAlertDismissed={(alertId) => {
                setAlerts((current) => current.filter((alert) => alert.id !== alertId))
                setSelectedAlertId(null)
              }}
            />
          </div>
          <div id="dispatch-editor" className="scroll-mt-24">
            <DispatchPanel
              bookings={bookings}
              sites={sites}
              operators={operators}
              availabilityAgents={initialData.availabilityAgents}
              selectedBookingRef={selectedBookingRef}
              onSelectedBookingRefChange={setSelectedBookingRef}
              onBookingSiteChange={handleBookingSiteChange}
              onBookingOperatorChange={handleBookingOperatorChange}
              onBookingAgentChange={handleBookingAgentChange}
              selectedAlertId={
                selectedAlertId?.startsWith('booking-unassigned-') || selectedAlertId?.startsWith('booking-overdue-')
                  ? selectedAlertId
                  : null
              }
              onAlertDismissed={(alertId) => {
                setAlerts((current) => current.filter((alert) => alert.id !== alertId))
                setSelectedAlertId(null)
              }}
              onBookingUpdated={(bookingRef, updates) => {
                setBookings((current) => current.map((booking) => (
                  booking.booking_ref === bookingRef ? { ...booking, ...updates } : booking
                )))
                void refreshOverview()
              }}
            />
          </div>
        </div>
        )}

        {activeTab === 'leads' && (
          <CrmFollowUpPanel
            section="leads"
            quotes={quotes}
            leads={leads}
            onLeadUpdated={(leadId, updates) => {
              setLeads((current) => current.map((lead) => (
                lead.id === leadId ? { ...lead, ...updates } : lead
              )))
              void refreshOverview()
            }}
          />
        )}
      </div>
      <aside className="hidden min-w-0 xl:sticky xl:top-4 xl:block">
        <AlertsPanel alerts={alerts} onOpenAlert={openAlert} onDismissAlert={dismissAlert} />
      </aside>
      </div>

      {alertsOpen ? (
        <div id="admin-alert-drawer" className="fixed inset-0 z-[70] xl:hidden" role="dialog" aria-modal="true" aria-labelledby="admin-alert-drawer-title">
          <button
            type="button"
            aria-label="Close action panel"
            onClick={() => setAlertsOpen(false)}
            className="absolute inset-0 bg-slate-950/35"
          />
          <aside className="absolute inset-y-0 right-0 w-[min(28rem,calc(100vw-1rem))] overflow-y-auto bg-gray-50 p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="admin-alert-drawer-title" className="text-lg font-bold" style={{ color: '#1a2744' }}>Action panel</h2>
              <button
                type="button"
                autoFocus
                onClick={() => setAlertsOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                Close
              </button>
            </div>
            <AlertsPanel alerts={alerts} onOpenAlert={openAlert} onDismissAlert={dismissAlert} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}
