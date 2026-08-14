'use client'

import { useEffect, useState } from 'react'
import type { AdminDashboardData } from './AdminDashboard'
import { getRelevantOperators } from '@/lib/operatorMatching'

type BookingItem = AdminDashboardData['bookings'][number]

const inspectionStatuses = ['pending', 'scheduled', 'completed', 'cancelled']

function toDateTimeInputValue(value?: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  const hours = `${parsed.getHours()}`.padStart(2, '0')
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function toIsoOrNull(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export default function DispatchPanel({
  bookings,
  sites,
  operators,
  availabilityAgents,
  selectedBookingRef,
  onSelectedBookingRefChange,
  onBookingUpdated,
  onBookingSiteChange,
  onBookingOperatorChange,
  onBookingAgentChange,
}: {
  bookings: BookingItem[]
  sites: AdminDashboardData['sites']
  operators: AdminDashboardData['operators']
  availabilityAgents: AdminDashboardData['availabilityAgents']
  selectedBookingRef: string
  onSelectedBookingRefChange: (bookingRef: string) => void
  onBookingUpdated: (bookingRef: string, updates: Partial<BookingItem>) => void
  onBookingSiteChange: (bookingRef: string, siteId: string) => Promise<void>
  onBookingOperatorChange: (bookingRef: string, operatorId: string) => Promise<void>
  onBookingAgentChange: (bookingRef: string, agentId: string) => Promise<void>
}) {
  const selected = bookings.find((booking) => booking.booking_ref === selectedBookingRef) ?? bookings[0]
  const [inspectionStatus, setInspectionStatus] = useState('pending')
  const [inspectionScheduledFor, setInspectionScheduledFor] = useState('')
  const [inspectionCompletedAt, setInspectionCompletedAt] = useState('')
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isAssignmentSaving, setIsAssignmentSaving] = useState(false)
  const originalInspectionStatus = selected?.inspection_status ?? 'pending'
  const originalInspectionScheduledFor = toDateTimeInputValue(selected?.inspection_scheduled_for)
  const originalInspectionCompletedAt = toDateTimeInputValue(selected?.inspection_completed_at)
  const originalDispatchNotes = selected?.dispatch_notes ?? ''
  const relevantOperators = selected
    ? getRelevantOperators(operators, selected.inputs?.city, selected.inputs?.premisesType)
    : []
  const hasChanges = Boolean(
    selected && (
      inspectionStatus !== originalInspectionStatus ||
      inspectionScheduledFor !== originalInspectionScheduledFor ||
      inspectionCompletedAt !== originalInspectionCompletedAt ||
      dispatchNotes !== originalDispatchNotes
    )
  )
  const dispatchSummary =
    inspectionStatus === 'scheduled'
      ? 'Inspection is scheduled. Confirm time, assignment, and field notes before dispatch.'
      : inspectionStatus === 'completed'
        ? 'Inspection is marked complete. Capture the completion time and any final handoff notes.'
        : inspectionStatus === 'cancelled'
          ? 'Inspection is cancelled. Keep notes clear so the team understands what changed.'
          : 'Inspection is still pending. Use this panel to schedule the site visit and prepare dispatch notes.'

  useEffect(() => {
    if (!selected) return
    setInspectionStatus(selected.inspection_status ?? 'pending')
    setInspectionScheduledFor(toDateTimeInputValue(selected.inspection_scheduled_for))
    setInspectionCompletedAt(toDateTimeInputValue(selected.inspection_completed_at))
    setDispatchNotes(selected.dispatch_notes ?? '')
    setStatus(null)
    setError(null)
  }, [selectedBookingRef, selected])

  if (!selected) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No bookings available for dispatch.</div>
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'booking.inspectionWorkflow',
          bookingRef: selected.booking_ref,
          inspectionStatus,
          inspectionScheduledFor: toIsoOrNull(inspectionScheduledFor),
          inspectionCompletedAt: toIsoOrNull(inspectionCompletedAt),
          dispatchNotes,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update inspection workflow.')
      }

      onBookingUpdated(selected.booking_ref, {
        inspection_status: inspectionStatus,
        inspection_scheduled_for: toIsoOrNull(inspectionScheduledFor),
        inspection_completed_at: toIsoOrNull(inspectionCompletedAt),
        dispatch_notes: dispatchNotes,
      })
      setStatus('Inspection workflow updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update inspection workflow.')
    } finally {
      setIsSaving(false)
    }
  }

  function resetForm() {
    if (!selected) return
    setInspectionStatus(originalInspectionStatus)
    setInspectionScheduledFor(originalInspectionScheduledFor)
    setInspectionCompletedAt(originalInspectionCompletedAt)
    setDispatchNotes(originalDispatchNotes)
    setStatus(null)
    setError(null)
  }

  function stampCompletionTime() {
    setInspectionStatus('completed')
    setInspectionCompletedAt(toDateTimeInputValue(new Date().toISOString()))
  }

  function clearSchedule() {
    setInspectionScheduledFor('')
    if (inspectionStatus === 'scheduled') {
      setInspectionStatus('pending')
    }
  }

  async function handleSiteChange(siteId: string) {
    setIsAssignmentSaving(true)
    try {
      await onBookingSiteChange(selected.booking_ref, siteId)
    } finally {
      setIsAssignmentSaving(false)
    }
  }

  async function handleOperatorChange(operatorId: string) {
    setIsAssignmentSaving(true)
    try {
      await onBookingOperatorChange(selected.booking_ref, operatorId)
    } finally {
      setIsAssignmentSaving(false)
    }
  }

  async function handleAssignmentChange(value: string) {
    if (value.startsWith('agent:')) {
      await onBookingAgentChange(selected.booking_ref, value.slice('agent:'.length))
      return
    }

    await onBookingOperatorChange(
      selected.booking_ref,
      value.startsWith('operator:') ? value.slice('operator:'.length) : '',
    )
  }

  const selectedAssignment = selected.assigned_operator_id
    ? `operator:${selected.assigned_operator_id}`
    : selected.inputs?.preferredInspectionAssigneeId
      ? `agent:${selected.inputs.preferredInspectionAssigneeId}`
      : ''

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Dispatch / inspection workflow</h2>
          <p className="mt-1 text-sm text-gray-600">Keep inspection timing, status, and field notes aligned before work is assigned.</p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
          {inspectionStatus.replace(/_/g, ' ')}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">Booking to dispatch</span>
        <select
          value={selected?.booking_ref ?? ''}
          onChange={(e) => onSelectedBookingRefChange(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
        >
          {bookings.map((booking) => (
            <option key={booking.booking_ref} value={booking.booking_ref}>
              {booking.booking_ref} — {booking.inputs?.businessName ?? 'Unknown'}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Booking ref</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">{selected.booking_ref}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Business</div>
          <div className="mt-1 text-sm text-gray-900">{selected.inputs?.businessName ?? 'Unknown business'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Address</div>
          <div className="mt-1 text-sm text-gray-900">{selected.inputs?.address ?? 'No address recorded'}</div>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {dispatchSummary}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-amber-950">Assignment</h3>
          <p className="mt-1 text-sm text-amber-900">Assign the site and operator here to clear missing-assignment alerts.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Site</span>
            <select
              value={selected.site_id ?? ''}
              onChange={(e) => void handleSiteChange(e.target.value)}
              disabled={isAssignmentSaving || isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Unassigned</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.site_name || site.address}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Operator / agent</span>
            <select
              value={selectedAssignment}
              onChange={(e) => void handleAssignmentChange(e.target.value)}
              disabled={isAssignmentSaving || isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Unassigned</option>
              {relevantOperators.length > 0 ? (
                <optgroup label="Owner-operators">
                  {relevantOperators.map((operator) => (
                    <option key={`operator:${operator.id}`} value={`operator:${operator.id}`}>{operator.business_name} — {operator.operator_name}</option>
                  ))}
                </optgroup>
              ) : null}
              {availabilityAgents.filter((agent) => agent.active).length > 0 ? (
                <optgroup label="Regional agents">
                  {availabilityAgents.filter((agent) => agent.active).map((agent) => (
                    <option key={`agent:${agent.id}`} value={`agent:${agent.id}`}>{agent.name} — {agent.city}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        </div>
        {selected.linkedOperatorId && !selected.assigned_operator_id && !selected.inputs?.preferredInspectionAssigneeId ? (
          <button
            type="button"
            onClick={() => void handleOperatorChange(selected.linkedOperatorId as string)}
            disabled={isAssignmentSaving || isSaving}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
          >
            Assign linked regional operator
          </button>
        ) : null}
      </div>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Inspection status</span>
        <select
          value={inspectionStatus}
          onChange={(e) => setInspectionStatus(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
        >
          {inspectionStatuses.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Scheduled inspection time</span>
        <input
          type="datetime-local"
          value={inspectionScheduledFor}
          onChange={(e) => setInspectionScheduledFor(e.target.value)}
          disabled={isSaving || inspectionStatus === 'cancelled'}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Inspection completed at</span>
        <input
          type="datetime-local"
          value={inspectionCompletedAt}
          onChange={(e) => setInspectionCompletedAt(e.target.value)}
          disabled={isSaving || inspectionStatus === 'pending'}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clearSchedule}
          disabled={isSaving || !inspectionScheduledFor}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          Clear schedule
        </button>
        <button
          type="button"
          onClick={stampCompletionTime}
          disabled={isSaving}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          Mark complete now
        </button>
      </div>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Dispatch notes</span>
        <textarea
          value={dispatchNotes}
          onChange={(e) => setDispatchNotes(e.target.value)}
          rows={5}
          disabled={isSaving}
          placeholder="Dispatch notes"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
        <div className="text-sm text-gray-600">
          {hasChanges ? 'Dispatch changes are ready to save.' : 'No dispatch changes yet.'}
        </div>
        <button
          type="button"
          onClick={resetForm}
          disabled={!hasChanges || isSaving}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          Reset changes
        </button>
      </div>

      {status ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{status}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || !hasChanges}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#1a2744' }}
      >
        {isSaving ? 'Saving dispatch workflow…' : hasChanges ? 'Save dispatch workflow' : 'No changes to save'}
      </button>
    </div>
  )
}
