'use client'

import { useMemo, useState } from 'react'
import BookingEditor from './BookingEditor'
import AuditLogPanel from './AuditLogPanel'
import DispatchPanel from './DispatchPanel'
import UpcomingInspectionsPanel from './UpcomingInspectionsPanel'
import OperatorNotesPanel from './OperatorNotesPanel'
import DispatchBoard from './DispatchBoard'
import SiteNotesPanel from './SiteNotesPanel'
import CrmFollowUpPanel from './CrmFollowUpPanel'
import OverdueWorkflowPanel from './OverdueWorkflowPanel'
import ReportingPanel from './ReportingPanel'
import AlertsPanel from './AlertsPanel'
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
  sites: SiteRow[]
  overview: {
    reporting: ReportingSnapshot
    alerts: AdminAlertRow[]
    auditLog: AuditLogRow[]
  }
}

interface Props {
  initialData: AdminDashboardData
}

const tabs = [
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'clients', label: 'Clients' },
  { key: 'sites', label: 'Sites / Leads' },
  { key: 'operators', label: 'Owner-Operators' },
  { key: 'settings', label: 'Settings' },
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

export default function AdminDashboard({ initialData }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('quotes')
  const [quotes, setQuotes] = useState(initialData.quotes)
  const [bookings, setBookings] = useState(initialData.bookings)
  const [leads, setLeads] = useState(initialData.leads)
  const [reportingSnapshot, setReportingSnapshot] = useState(initialData.overview.reporting)
  const [alerts, setAlerts] = useState(initialData.overview.alerts)
  const [sites] = useState(initialData.sites)
  const [operators] = useState(initialData.operators)
  const [actionState, setActionState] = useState<{ loading: string | null; message: string | null; error: string | null }>({
    loading: null,
    message: null,
    error: null,
  })

  function openWorkArea(nextTab: TabKey) {
    setActiveTab(nextTab)
    window.setTimeout(() => {
      document.getElementById('admin-workarea')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function openAlert(alert: AdminAlertRow) {
    if (alert.kind === 'new_quote') {
      window.location.assign(`/admin/quotes/${encodeURIComponent(alert.entity_ref)}`)
      return
    }

    openWorkArea('bookings')
    window.setTimeout(() => {
      document.getElementById(`booking-row-${alert.entity_ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
  }

  const stats = useMemo(
    () => [
      { label: 'Pending quotes', value: quotes.filter((quote) => quote.status === 'pending').length },
      { label: 'Pending bookings', value: bookings.filter((booking) => booking.status === 'pending').length },
      { label: 'Clients', value: initialData.stats.clientsTotal },
      { label: 'Active operators', value: initialData.stats.ownerOperatorsActive },
      { label: 'Leads', value: initialData.stats.leadsTotal },
    ],
    [quotes, bookings, initialData.stats.clientsTotal, initialData.stats.ownerOperatorsActive, initialData.stats.leadsTotal]
  )

  const workflowCoverage = useMemo(
    () => [
      {
        label: 'Active sites',
        value: sites.filter((site) => site.is_active).length,
        tone: 'text-emerald-700',
      },
      {
        label: 'Bookings missing site',
        value: bookings.filter((booking) => !booking.site_id && booking.status !== 'completed' && booking.status !== 'cancelled').length,
        tone: 'text-amber-700',
      },
      {
        label: 'Bookings missing operator',
        value: bookings.filter((booking) => !booking.assigned_operator_id && !booking.linkedOperatorId && booking.status !== 'completed' && booking.status !== 'cancelled').length,
        tone: 'text-amber-700',
      },
      {
        label: 'New leads to triage',
        value: leads.filter((lead) => (lead.follow_up_status ?? 'new') === 'new').length,
        tone: 'text-blue-700',
      },
    ],
    [bookings, leads, sites]
  )

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

    setBookings((current) => current.map((booking) => (
      booking.booking_ref === bookingRef ? { ...booking, assigned_operator_id: operatorId || null } : booking
    )))
    void refreshOverview()
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <ReportingPanel snapshot={reportingSnapshot} onMetricClick={openWorkArea} />
        <AlertsPanel alerts={alerts} onOpenAlert={openAlert} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{stat.label}</div>
            <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {actionState.message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {actionState.message}
        </div>
      ) : null}
      {actionState.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionState.error}
        </div>
      ) : null}

      <div id="admin-workarea" className="scroll-mt-24">
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => openWorkArea(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'quotes' && (
        <div className="space-y-6">
          <CrmFollowUpPanel
            quotes={quotes}
            leads={leads}
            onQuoteUpdated={(quoteRef, updates) => {
              setQuotes((current) => current.map((quote) => (
                quote.quote_ref === quoteRef ? { ...quote, ...updates } : quote
              )))
              void refreshOverview()
            }}
            onLeadUpdated={(leadId, updates) => {
              setLeads((current) => current.map((lead) => (
                lead.id === leadId ? { ...lead, ...updates } : lead
              )))
              void refreshOverview()
            }}
          />
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Recent Quotes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Frequency</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 font-mono">
                        <div>{quote.quote_ref}</div>
                        <div className="text-xs text-gray-500 mt-1">{formatDate(quote.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">{quote.inputs?.businessName ?? '—'}</td>
                      <td className="px-4 py-3 capitalize">{quote.inputs?.city ?? '—'}</td>
                      <td className="px-4 py-3">{quote.inputs?.frequency?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={quote.status}
                          onChange={(event) => handleQuoteStatusChange(quote.quote_ref, event.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          {quoteStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuoteResend(quote.quote_ref)}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Resend email
                          </button>
                          <a
                            href={`/quote/${quote.quote_ref}`}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 text-center"
                          >
                            View quote
                          </a>
                          <a
                            href={`/admin/quotes/${quote.quote_ref}`}
                            className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 hover:border-green-300 text-center"
                          >
                            Open workbench
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'bookings' && (
        <div className="space-y-6">
          <OverdueWorkflowPanel bookings={bookings} />
          <DispatchBoard bookings={bookings} />
          <UpcomingInspectionsPanel bookings={bookings} />
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Recent Bookings</h2>
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
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleBookingResend(booking.booking_ref)}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Resend confirmation
                          </button>
                          {linkedAgentId ? (
                            <a
                              href={`/admin/availability/quoters/${encodeURIComponent(linkedAgentId)}`}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm font-semibold text-blue-800 hover:border-blue-300"
                            >
                              Edit agent schedule
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
          <BookingEditor
            bookings={bookings}
            onBookingUpdated={(updatedBooking) => {
              setBookings((current) => current.map((booking) => (
                booking.booking_ref === updatedBooking.booking_ref ? updatedBooking : booking
              )))
              void refreshOverview()
            }}
          />
          <DispatchPanel
            bookings={bookings}
            onBookingUpdated={(bookingRef, updates) => {
              setBookings((current) => current.map((booking) => (
                booking.booking_ref === bookingRef ? { ...booking, ...updates } : booking
              )))
              void refreshOverview()
            }}
          />
        </div>
        )}

        {activeTab === 'clients' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Clients</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Business</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">City</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {initialData.clients.map((client) => (
                  <tr key={client.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{client.business_name}</td>
                    <td className="px-4 py-3">{client.contact_name}</td>
                    <td className="px-4 py-3">{client.email}</td>
                    <td className="px-4 py-3 capitalize">{client.city ?? '—'}</td>
                    <td className="px-4 py-3">{formatDate(client.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {activeTab === 'sites' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Sites</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Site</th>
                    <th className="px-4 py-3 text-left">Address</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {initialData.sites.map((site) => (
                    <tr key={site.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">{site.site_name ?? '—'}</td>
                      <td className="px-4 py-3">{site.address}</td>
                      <td className="px-4 py-3 capitalize">{site.city}</td>
                      <td className="px-4 py-3">{site.premises_type ?? '—'}</td>
                      <td className="px-4 py-3">{site.is_active ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <SiteNotesPanel sites={initialData.sites} />
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Leads</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Business</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">City</th>
                      <th className="px-4 py-3 text-left">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-t border-gray-100">
                        <td className="px-4 py-3">{lead.business_name ?? '—'}</td>
                        <td className="px-4 py-3">{lead.email}</td>
                        <td className="px-4 py-3 capitalize">{lead.city ?? '—'}</td>
                        <td className="px-4 py-3">{lead.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
              <h2 className="text-lg font-bold mb-3" style={{ color: '#1a2744' }}>Workflow coverage</h2>
              <p className="text-sm text-gray-600 mb-4">
                Use this area to sanity-check dispatch readiness before assigning operators or turning a lead into an active site.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {workflowCoverage.map((item) => (
                  <div key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
                    <div className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-600">
                Priority workflow: create a site for confirmed customers, assign the site to each booking, then assign an operator so dispatch alerts clear automatically.
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'operators' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Owner-Operators</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">Operator</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Verified</th>
                    <th className="px-4 py-3 text-left">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {initialData.operators.map((operator) => (
                    <tr key={operator.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">{operator.business_name}</td>
                      <td className="px-4 py-3">{operator.operator_name}</td>
                      <td className="px-4 py-3 capitalize">{operator.city}</td>
                      <td className="px-4 py-3">{operator.is_verified ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">{operator.is_active ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <OperatorNotesPanel operators={initialData.operators} />
        </div>
        )}

        {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
            <h2 className="text-lg font-bold mb-3" style={{ color: '#1a2744' }}>Settings / control surface</h2>
            <p className="text-sm text-gray-600 mb-4">
              Content, pricing, and availability are now managed via their own tabs in this admin area. This section gives a clean place to extend additional controls.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900 mb-1">Content</div>
                <div className="text-sm text-gray-600">Edit key website copy without code changes.</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900 mb-1">Pricing</div>
                <div className="text-sm text-gray-600">Adjust quote rules, rates, and multipliers.</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900 mb-1">Availability</div>
                <div className="text-sm text-gray-600">Manage service zones and inspection windows.</div>
              </div>
            </div>
          </div>
          <AuditLogPanel logs={initialData.overview.auditLog} />
        </div>
        )}
      </div>
    </div>
  )
}
