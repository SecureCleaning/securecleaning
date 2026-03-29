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
  inspection_status?: string | null
  inspection_scheduled_for?: string | null
  inspection_completed_at?: string | null
  dispatch_notes?: string | null
  inputs?: {
    businessName?: string
    city?: string
    email?: string
    address?: string
    frequency?: string
    premisesType?: string
    contactName?: string
    phone?: string
    preferredStartDate?: string
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

export interface AdminDashboardData {
  stats: DashboardStats
  quotes: QuoteRow[]
  bookings: BookingRow[]
  clients: ClientRow[]
  leads: LeadRow[]
  operators: OperatorRow[]
  sites: SiteRow[]
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
  const [sites] = useState(initialData.sites)
  const [operators] = useState(initialData.operators)
  const [actionState, setActionState] = useState<{ loading: string | null; message: string | null; error: string | null }>({
    loading: null,
    message: null,
    error: null,
  })

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
  }

  async function handleBookingStatusChange(bookingRef: string, status: string) {
    const ok = await runAction({ action: 'booking.status', bookingRef, status }, `Booking ${bookingRef} updated to ${status}.`)
    if (!ok) return

    setBookings((current) => current.map((booking) => (booking.booking_ref === bookingRef ? { ...booking, status } : booking)))
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
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <ReportingPanel />
        <AlertsPanel />
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

      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
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
          <CrmFollowUpPanel quotes={quotes} leads={initialData.leads} />
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
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Frequency</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Site</th>
                    <th className="px-4 py-3 text-left">Operator</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 font-mono">
                        <div>{booking.booking_ref}</div>
                        <div className="text-xs text-gray-500 mt-1">{formatDate(booking.first_clean_date)}</div>
                      </td>
                      <td className="px-4 py-3">{booking.inputs?.businessName ?? '—'}</td>
                      <td className="px-4 py-3 capitalize">{booking.inputs?.city ?? '—'}</td>
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
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleBookingResend(booking.booking_ref)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
                        >
                          Resend confirmation
                        </button>
                      </td>
                    </tr>
                  ))}
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
            }}
          />
          <DispatchPanel
            bookings={bookings}
            onBookingUpdated={(bookingRef, updates) => {
              setBookings((current) => current.map((booking) => (
                booking.booking_ref === bookingRef ? { ...booking, ...updates } : booking
              )))
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
                    {initialData.leads.map((lead) => (
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
              <h2 className="text-lg font-bold mb-3" style={{ color: '#1a2744' }}>Site model now added</h2>
              <p className="text-sm text-gray-600 mb-3">
                A dedicated sites migration and admin API have been added. Next step is a full create/edit UI and linking bookings directly to sites in admin workflows.
              </p>
              <ul className="list-disc ml-5 text-sm text-gray-700 space-y-2">
                <li>Sites table migration prepared</li>
                <li>Admin sites API added</li>
                <li>Dashboard now surfaces site records</li>
              </ul>
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
          <AuditLogPanel />
        </div>
      )}
    </div>
  )
}
