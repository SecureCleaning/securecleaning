'use client'

import { useMemo, useRef, useState } from 'react'
import { formatCurrency, formatPriceRange } from '@/lib/quoteEngine'
import type { QuotePricingConfig } from '@/lib/pricing'
import type { QuoteInputs, QuoteResult, PremisesType } from '@/lib/types'
import type { QuoteWorkflowRecord } from '@/lib/quoteWorkflowData'
import {
  buildFirmQuotePreview,
  createRoomItem,
  deriveQuoteInputsFromRooms,
  getRoomAreaAllocationTotal,
  getRoomPricingBreakdown,
  getWorkflowRoomMetricFields,
  type FirmQuoteDraft,
  type InspectionReport,
  type WorkflowRoomItem,
  type WorkflowRoomType,
} from '@/lib/quoteWorkflow'
import {
  getRoomTaskCadenceLabel,
  getRoomTypeConfigById,
  ROOM_TASK_CADENCE_OPTIONS,
  type QuoteRoomTypeConfig,
  type RoomMetricFieldConfig,
  type RoomTaskCadence,
} from '@/lib/roomTypeConfig'

type Props = {
  quote: QuoteWorkflowRecord
  pricingConfig: QuotePricingConfig
  roomTypeConfig: QuoteRoomTypeConfig
  workflowApiPath?: string
  canEmailScope?: boolean
  updatedQuoteApiPath?: string
  canEmailUpdatedQuote?: boolean
  canReconcileDelivery?: boolean
}

const frequencyOptions = [
  ['daily', 'Daily'],
  ['3x_week', '3x per week'],
  ['2x_week', '2x per week'],
  ['weekly', 'Weekly'],
  ['fortnightly', 'Fortnightly'],
] as const

const timeOptions = [
  ['business_hours', 'Business hours'],
  ['after_hours', 'After hours'],
  ['weekend', 'Weekend'],
] as const

const premisesOptions: Array<[PremisesType, string]> = [
  ['office', 'Office'],
  ['medical', 'Medical / Healthcare'],
  ['industrial', 'Industrial'],
  ['childcare', 'Childcare'],
  ['retail', 'Retail'],
  ['gym', 'Gym / Fitness'],
  ['warehouse', 'Warehouse'],
  ['function_centre', 'Function Centre / Venue'],
  ['sports_facility', 'Sports Facility / Recreation Centre'],
  ['other', 'Other'],
]

function labelForFrequency(value?: string) {
  return frequencyOptions.find(([key]) => key === value)?.[1] ?? (value === 'once_off' ? 'Recurring service' : value) ?? '—'
}

function labelForTime(value?: string) {
  return timeOptions.find(([key]) => key === value)?.[1] ?? value ?? '—'
}

function labelForPremises(value?: string) {
  return premisesOptions.find(([key]) => key === value)?.[1] ?? value ?? '—'
}

function originalSummary(result: QuoteResult) {
  return formatPriceRange(result.totalLow, result.totalHigh)
}

function describeFieldPricing(label: string, pricePerUnit?: number) {
  const rate = Number(pricePerUnit ?? 0)
  if (!Number.isFinite(rate) || rate === 0) {
    return `${label} does not currently change the quote total.`
  }

  return `${label} adds ${formatCurrency(rate)} per unit, per visit.`
}

export default function QuoteWorkflowEditor({
  quote,
  pricingConfig,
  roomTypeConfig,
  workflowApiPath = `/api/admin/quotes/${quote.quoteRef}/workflow`,
  canEmailScope = false,
  updatedQuoteApiPath = `/api/admin/quotes/${quote.quoteRef}/send`,
  canEmailUpdatedQuote = true,
  canReconcileDelivery = false,
}: Props) {
  const [inspectionReport, setInspectionReport] = useState<InspectionReport>(quote.inspectionReport)
  const [firmQuoteDraft, setFirmQuoteDraft] = useState<FirmQuoteDraft>(quote.firmQuoteDraft)
  const [finalPublished, setFinalPublished] = useState(Boolean(quote.finalDocument))
  const [previewMode, setPreviewMode] = useState(false)
  const [saveState, setSaveState] = useState<{ saving: boolean; message: string | null; error: string | null }>({
    saving: false,
    message: null,
    error: null,
  })
  const [previewHighlighted, setPreviewHighlighted] = useState(false)
  const previewRef = useRef<HTMLElement | null>(null)
  const [scopeAction, setScopeAction] = useState<{ busy: boolean; message: string | null; error: string | null }>({
    busy: false,
    message: null,
    error: null,
  })
  const [quoteEmailAction, setQuoteEmailAction] = useState<{ busy: boolean; message: string | null; error: string | null }>({
    busy: false,
    message: null,
    error: null,
  })
  const [quoteEmailComposerOpen, setQuoteEmailComposerOpen] = useState(false)
  const [quoteEmailDraft, setQuoteEmailDraft] = useState({
    to: quote.finalDocument?.inputs.email ?? quote.inputs.email,
    subject: `Your updated Secure Cleaning quote — ${quote.quoteRef}`,
    message: 'Following our review of your requirements, your updated quote is ready to view online.',
  })

  const derivedInputs = useMemo(() => deriveQuoteInputsFromRooms(firmQuoteDraft, roomTypeConfig), [firmQuoteDraft, roomTypeConfig])
  const preview = useMemo(() => buildFirmQuotePreview(firmQuoteDraft, pricingConfig, roomTypeConfig), [firmQuoteDraft, pricingConfig, roomTypeConfig])
  const roomPricingBreakdown = useMemo(
    () => getRoomPricingBreakdown(firmQuoteDraft, pricingConfig, roomTypeConfig),
    [firmQuoteDraft, pricingConfig, roomTypeConfig]
  )
  const roomTypeOptions = useMemo(
    () => roomTypeConfig.roomTypes.map((roomType) => [roomType.id as WorkflowRoomType, roomType.label] as const),
    [roomTypeConfig]
  )
  const systemMetricFieldOptions = useMemo(() => {
    const fields = new Map<string, RoomMetricFieldConfig>()
    roomTypeConfig.roomTypes.forEach((roomType) => roomType.fields.forEach((field) => {
      if (!fields.has(field.id)) fields.set(field.id, field)
    }))
    return [...fields.values()]
  }, [roomTypeConfig])

  function openPreview(options?: { smooth?: boolean }) {
    const behavior = options?.smooth === false ? 'auto' : 'smooth'
    setPreviewMode(true)
    setPreviewHighlighted(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior })
        previewRef.current?.scrollIntoView({ behavior, block: 'start' })
        previewRef.current?.focus()
        if (window.location.hash !== '#firm-quote-preview') {
          window.history.replaceState(null, '', '#firm-quote-preview')
        }
      })
    })
    window.setTimeout(() => setPreviewHighlighted(false), 2200)
  }

  function closePreview() {
    setPreviewMode(false)
    if (window.location.hash === '#firm-quote-preview') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  function getScopeUrl() {
    const variant = finalPublished || firmQuoteDraft.status === 'sent' ? '?variant=final' : ''
    return `${window.location.origin}/scope/${quote.quoteRef}${variant}`
  }

  async function copyScopeLink() {
    try {
      await navigator.clipboard.writeText(getScopeUrl())
      setScopeAction({ busy: false, message: 'Client scope link copied.', error: null })
    } catch {
      setScopeAction({ busy: false, message: null, error: 'Your browser did not allow the link to be copied.' })
    }
  }

  async function sendScopeLink() {
    setScopeAction({ busy: true, message: null, error: null })

    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quote.scopeResend', quoteRef: quote.quoteRef }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to send the scope link.')
      setScopeAction({ busy: false, message: `Scope link sent to ${quote.inputs.email}.`, error: null })
    } catch (error) {
      setScopeAction({
        busy: false,
        message: null,
        error: error instanceof Error ? error.message : 'Failed to send the scope link.',
      })
    }
  }

  async function sendUpdatedQuote() {
    setQuoteEmailAction({ busy: true, message: null, error: null })

    try {
      const response = await fetch(updatedQuoteApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteEmailDraft),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to email the updated quote.')
      setQuoteEmailComposerOpen(false)
      setFirmQuoteDraft((current) => ({ ...current, status: 'sent' }))
      setQuoteEmailAction({ busy: false, message: `Updated quote emailed to ${quoteEmailDraft.to}.`, error: null })
    } catch (error) {
      setQuoteEmailAction({
        busy: false,
        message: null,
        error: error instanceof Error ? error.message : 'Failed to email the updated quote.',
      })
    }
  }

  async function reconcileDelivery(resolution: 'confirmed_rejected' | 'confirmed_accepted') {
    setQuoteEmailAction({ busy: true, message: null, error: null })
    try {
      const path = `/api/admin/quotes/${quote.quoteRef}/send/reconcile`
      const inspect = await fetch(path)
      const inspected = await inspect.json()
      if (!inspect.ok || !inspected.success) throw new Error(inspected.error || 'Unable to inspect delivery status.')
      if (!inspected.attempt) throw new Error('There is no unresolved delivery attempt for this quote.')
      const evidence = window.prompt('Enter the provider evidence or support reference used to confirm this outcome:')?.trim()
      if (!evidence) throw new Error('Provider evidence is required before reconciliation.')
      const response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: inspected.attempt.id, resolution, evidence, providerMessageId: inspected.attempt.provider_message_id }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Delivery reconciliation failed.')
      if (resolution === 'confirmed_accepted') setFirmQuoteDraft((current) => ({ ...current, status: 'sent' }))
      setQuoteEmailAction({ busy: false, message: resolution === 'confirmed_accepted' ? 'Delivery confirmed and quote finalized as sent.' : 'Provider rejection confirmed. The quote can be retried safely.', error: null })
    } catch (error) {
      setQuoteEmailAction({ busy: false, message: null, error: error instanceof Error ? error.message : 'Delivery reconciliation failed.' })
    }
  }

  async function handleSave() {
    setSaveState({ saving: true, message: null, error: null })

    try {
      const response = await fetch(workflowApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspectionReport,
          firmQuoteDraft: {
            ...firmQuoteDraft,
            revisedInputs: derivedInputs,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save workflow.')
      }

      setFirmQuoteDraft((current) => ({
        ...current,
        revisedInputs: derivedInputs,
      }))
      if (result.status === 'reviewed') setFinalPublished(true)
      if (result.status === 'reviewed') {
        setQuoteEmailDraft((current) => ({ ...current, to: derivedInputs.email.trim().toLowerCase() }))
      }
      setSaveState({
        saving: false,
        message: result.status === 'reviewed'
          ? 'Final quote reviewed and published. It is now locked and ready to send.'
          : 'Inspection summary and firm quote draft saved.',
        error: null,
      })
      openPreview()
    } catch (error) {
      setSaveState({
        saving: false,
        message: null,
        error: error instanceof Error ? error.message : 'Failed to save workflow.',
      })
    }
  }

  function updateDraftInput<K extends keyof QuoteInputs>(key: K, value: QuoteInputs[K]) {
    setFirmQuoteDraft((current) => ({
      ...current,
      revisedInputs: {
        ...current.revisedInputs,
        [key]: value,
      },
    }))
  }

  function updateRoom(roomId: string, patch: Partial<WorkflowRoomItem>) {
    setFirmQuoteDraft((current) => ({
      ...current,
      roomItems: current.roomItems.map((room) => (
        room.id === roomId
          ? {
              ...room,
              ...patch,
              label:
                patch.type && (!patch.label || patch.label === room.label)
                  ? getRoomTypeConfigById(roomTypeConfig, patch.type)?.defaultLabel
                    ?? getRoomTypeConfigById(roomTypeConfig, patch.type)?.label
                    ?? room.label
                  : patch.label ?? room.label,
            }
          : room
      )),
    }))
  }

  function addRoom(type: WorkflowRoomType = 'office') {
    setFirmQuoteDraft((current) => ({
      ...current,
      roomItems: [...current.roomItems, createRoomItem(type, roomTypeConfig)],
    }))
  }

  function removeRoom(roomId: string) {
    setFirmQuoteDraft((current) => ({
      ...current,
      roomItems: current.roomItems.length > 1
        ? current.roomItems.filter((room) => room.id !== roomId)
        : current.roomItems,
    }))
  }

  function addBlankMetricField(room: WorkflowRoomItem) {
    const id = `custom_${Date.now().toString(36)}`
    updateRoom(room.id, {
      customMetricFields: [...(room.customMetricFields ?? []), {
        id,
        label: 'New field',
        inputType: 'integer',
        defaultValue: 0,
        includedUnits: 0,
        pricePerUnit: 0,
        cadence: 'every_clean',
        helpText: '',
      }],
      metrics: { ...(room.metrics ?? {}), [id]: 0 },
    })
  }

  function addSystemMetricField(room: WorkflowRoomItem, fieldId: string) {
    const field = systemMetricFieldOptions.find((candidate) => candidate.id === fieldId)
    if (!field) return
    const belongsToRoomType = getRoomTypeConfigById(roomTypeConfig, room.type)?.fields.some((candidate) => candidate.id === fieldId)
    updateRoom(room.id, {
      excludedMetricFieldIds: (room.excludedMetricFieldIds ?? []).filter((id) => id !== fieldId),
      customMetricFields: belongsToRoomType || (room.customMetricFields ?? []).some((candidate) => candidate.id === fieldId)
        ? room.customMetricFields ?? []
        : [...(room.customMetricFields ?? []), { ...field }],
      metrics: { ...(room.metrics ?? {}), [fieldId]: field.defaultValue },
    })
  }

  function removeMetricField(room: WorkflowRoomItem, fieldId: string) {
    const isCustom = (room.customMetricFields ?? []).some((field) => field.id === fieldId)
    const metrics = { ...(room.metrics ?? {}) }
    delete metrics[fieldId]
    updateRoom(room.id, isCustom ? {
      customMetricFields: (room.customMetricFields ?? []).filter((field) => field.id !== fieldId),
      metrics,
    } : {
      excludedMetricFieldIds: [...new Set([...(room.excludedMetricFieldIds ?? []), fieldId])],
      metrics,
    })
  }

  function updateCustomMetricField(room: WorkflowRoomItem, fieldId: string, patch: Partial<RoomMetricFieldConfig>) {
    updateRoom(room.id, {
      customMetricFields: (room.customMetricFields ?? []).map((field) => field.id === fieldId ? { ...field, ...patch } : field),
    })
  }

  const previewSection = (
    <section
      id="firm-quote-preview"
      ref={previewRef}
      tabIndex={-1}
      className={`rounded-2xl border bg-white p-6 shadow-sm transition-all ${
        previewHighlighted ? 'border-green-400 ring-4 ring-green-100' : 'border-gray-200'
      }`}
      style={{ scrollMarginTop: '96px' }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>Client Quote Preview</h2>
          <p className="text-sm text-gray-600 mt-1">
            This is the simplified firm quote view generated from the room schedule and summary fields.
          </p>
          {saveState.message ? (
            <div className="mt-3 inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              Preview refreshed from saved draft
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => window.open(`/scope/${quote.quoteRef}${finalPublished || firmQuoteDraft.status === 'sent' ? '?variant=final' : ''}`, '_blank', 'noopener,noreferrer')}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Open client view
          </button>
          <button
            type="button"
            onClick={copyScopeLink}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
          >
            Copy link
          </button>
          {canEmailScope ? (
            <button
              type="button"
              onClick={sendScopeLink}
              disabled={scopeAction.busy}
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scopeAction.busy ? 'Sending...' : 'Email scope link'}
            </button>
          ) : null}
          {canEmailUpdatedQuote ? (
            <button
              type="button"
              onClick={() => setQuoteEmailComposerOpen((open) => !open)}
              disabled={quoteEmailAction.busy || saveState.saving || firmQuoteDraft.status !== 'reviewed' || !finalPublished}
              className="rounded-lg border border-green-200 bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quoteEmailComposerOpen ? 'Close email' : firmQuoteDraft.status === 'sent' ? 'Final quote sent' : 'Send final quote'}
            </button>
          ) : null}
          {canReconcileDelivery && finalPublished ? (
            <>
              <button type="button" onClick={() => reconcileDelivery('confirmed_accepted')} disabled={quoteEmailAction.busy} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-60">Confirm provider delivery</button>
              <button type="button" onClick={() => reconcileDelivery('confirmed_rejected')} disabled={quoteEmailAction.busy} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60">Confirm provider rejection</button>
            </>
          ) : null}
          {!previewMode ? (
            <button
              type="button"
              onClick={() => openPreview()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
            >
              Focus preview
            </button>
          ) : null}
          <button
            type="button"
            onClick={closePreview}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
          >
            Back to editor
          </button>
        </div>
      </div>
      {scopeAction.message ? <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{scopeAction.message}</div> : null}
      {scopeAction.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{scopeAction.error}</div> : null}
      {quoteEmailAction.message ? <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{quoteEmailAction.message}</div> : null}
      {quoteEmailAction.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quoteEmailAction.error}</div> : null}
      {canEmailUpdatedQuote && quoteEmailComposerOpen ? (
        <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">Email updated quote</h3>
              <p className="mt-1 text-sm text-gray-600">Review the customer email and add any commentary before sending.</p>
            </div>
            <button
              type="button"
              onClick={() => setQuoteEmailComposerOpen(false)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
            >
              Cancel
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">
              To
              <input
                type="email"
                value={quoteEmailDraft.to}
                readOnly
                className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 font-normal text-gray-900"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Recipient is locked to the reviewed final document.</span>
            </label>
            <label className="text-sm font-semibold text-gray-700">
              Subject
              <input
                type="text"
                value={quoteEmailDraft.subject}
                onChange={(event) => setQuoteEmailDraft((current) => ({ ...current, subject: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-gray-700">
            Message
            <textarea
              rows={5}
              value={quoteEmailDraft.message}
              onChange={(event) => setQuoteEmailDraft((current) => ({ ...current, message: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900"
              placeholder="Add a note for the customer..."
            />
          </label>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={sendUpdatedQuote}
              disabled={quoteEmailAction.busy || saveState.saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quoteEmailAction.busy ? 'Sending...' : 'Send final quote'}
            </button>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Quote reference</div>
          <div className="font-mono font-semibold">{quote.quoteRef}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Indicative confirmed pricing</div>
          <div className="text-3xl font-bold text-green-700">
            {preview.suggestedPrice
              ? formatCurrency(preview.suggestedPrice)
              : `${formatCurrency(preview.adjustedLow)} – ${formatCurrency(preview.adjustedHigh)}`}
          </div>
          <div className="text-sm text-gray-500 mt-1">Per visit · excl. GST · finalised after inspection review</div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Quoted areas</div>
          <div className="space-y-2">
            {firmQuoteDraft.roomItems.map((room) => (
              <div key={room.id} className="rounded-xl bg-white border border-gray-200 px-4 py-3 text-sm text-gray-700">
                <div className="font-semibold" style={{ color: '#1a2744' }}>{room.label}</div>
                {room.description?.trim() ? <div className="mt-2 whitespace-pre-wrap text-gray-700">{room.description}</div> : null}
                <div className="text-gray-500 mt-1">
                  {(getRoomTypeConfigById(roomTypeConfig, room.type)?.label ?? room.type)} · Qty {room.quantity}
                  {getRoomTypeConfigById(roomTypeConfig, room.type)?.tracksSize && room.size > 0 ? ` · ${room.size} sqm each` : ''}
                  {room.floor > 1 ? ` · Floor ${room.floor}` : ''}
                </div>
                {room.moppingEnabled ? <div className="text-gray-500 mt-1">Mopping included</div> : null}
                {getRoomTypeConfigById(roomTypeConfig, room.type)?.fields?.length ? (
                  <div className="text-gray-500 mt-1">
                    {getRoomTypeConfigById(roomTypeConfig, room.type)?.fields.map((field) => `${field.label}: ${String(room.metrics?.[field.id] ?? field.defaultValue)}`).join(' · ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {firmQuoteDraft.scopeSummary ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Summary</div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{firmQuoteDraft.scopeSummary}</p>
          </div>
        ) : null}
        {firmQuoteDraft.inclusions ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Included services</div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{firmQuoteDraft.inclusions}</p>
          </div>
        ) : null}
        {firmQuoteDraft.exclusions ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Exclusions / assumptions</div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{firmQuoteDraft.exclusions}</p>
          </div>
        ) : null}
        {firmQuoteDraft.serviceCommentary ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Commentary</div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{firmQuoteDraft.serviceCommentary}</p>
          </div>
        ) : null}
      </div>
    </section>
  )

  if (previewMode) {
    return (
      <div className="space-y-6">
        {saveState.message ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {saveState.message}
          </div>
        ) : null}
        {saveState.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveState.error}
          </div>
        ) : null}
        {previewSection}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-6">
        <div className="contents">
          <details open className="order-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>Original Remote Quote</h2>
                <span className="text-sm font-semibold text-gray-500">Expand / collapse</span>
              </div>
            </summary>
            <div className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-gray-500">Business</div>
                <div className="font-semibold">{quote.inputs.businessName}</div>
              </div>
              <div>
                <div className="text-gray-500">Contact</div>
                <div className="font-semibold">{quote.inputs.contactName}</div>
              </div>
              <div>
                <div className="text-gray-500">Location</div>
                <div className="font-semibold">
                  {[quote.inputs.suburb, quote.inputs.postcode].filter(Boolean).join(' ')} · {quote.inputs.city}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Premises</div>
                <div className="font-semibold">
                  {labelForPremises(quote.inputs.premisesType)} · {quote.inputs.floorArea} sqm
                </div>
              </div>
              <div>
                <div className="text-gray-500">Frequency</div>
                <div className="font-semibold">{labelForFrequency(quote.inputs.frequency)}</div>
              </div>
              <div>
                <div className="text-gray-500">Time preference</div>
                <div className="font-semibold">{labelForTime(quote.inputs.timePreference)}</div>
              </div>
              <div>
                <div className="text-gray-500">Instant estimate</div>
                <div className="font-semibold">{originalSummary(quote.result)}</div>
              </div>
              <div>
                <div className="text-gray-500">Status</div>
                <div className="font-semibold capitalize">{quote.status}</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <div className="font-semibold mb-2">Original client notes</div>
              <div>{quote.inputs.notes?.trim() || 'No notes captured on the remote quote.'}</div>
            </div>
            </div>
          </details>

          <section className="order-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: '#1a2744' }}>Inspection Summary</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Inspector name</span>
                <input
                  value={inspectionReport.inspectorName}
                  onChange={(event) => setInspectionReport((current) => ({ ...current, inspectorName: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Inspection date</span>
                <input
                  type="date"
                  value={inspectionReport.inspectedAt}
                  onChange={(event) => setInspectionReport((current) => ({ ...current, inspectedAt: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Site contact</span>
                <input
                  value={inspectionReport.siteContact}
                  onChange={(event) => setInspectionReport((current) => ({ ...current, siteContact: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Recommended frequency</span>
                <select
                  value={inspectionReport.recommendedFrequency}
                  onChange={(event) => setInspectionReport((current) => ({ ...current, recommendedFrequency: event.target.value as InspectionReport['recommendedFrequency'] }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 bg-white"
                >
                  {frequencyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 flex flex-wrap items-center gap-2 font-medium text-gray-700">
                  Inspection summary
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Internal only</span>
                </span>
                <textarea
                  value={inspectionReport.summary}
                  onChange={(event) => setInspectionReport((current) => ({ ...current, summary: event.target.value }))}
                  rows={5}
                  placeholder="Record access, parking, security, risks, exclusions, and follow-up actions needed by staff or the agent."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
                <span className="mt-1 block text-xs text-gray-500">This is operational information and is never shown in the client quote or scope.</span>
              </label>
            </div>
          </section>
        </div>

        <div className="contents">
          <details open className="order-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>Firm Quote Draft</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Build the scope by adding or removing room groups. The quote recalculates from the room schedule automatically.
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-500">Expand / collapse</span>
              </div>
            </summary>
            <div className="mt-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Quote workflow status</span>
              <select
                value={firmQuoteDraft.status}
                disabled={finalPublished || firmQuoteDraft.status === 'sent' || firmQuoteDraft.status === 'accepted'}
                onChange={(event) => setFirmQuoteDraft((current) => ({ ...current, status: event.target.value as FirmQuoteDraft['status'] }))}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                <option value="draft">Draft</option>
                <option value="reviewed">Reviewed</option>
                {firmQuoteDraft.status === 'sent' ? <option value="sent">Sent</option> : null}
                {firmQuoteDraft.status === 'accepted' ? <option value="accepted">Accepted</option> : null}
              </select>
              <span className="mt-1 block text-xs text-gray-500">Reviewed publishes and locks the final document. Sent is set only by the protected send action.</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Premises type</span>
                <select
                  value={firmQuoteDraft.revisedInputs.premisesType}
                  onChange={(event) => updateDraftInput('premisesType', event.target.value as QuoteInputs['premisesType'])}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 bg-white"
                >
                  {premisesOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Time preference</span>
                <select
                  value={firmQuoteDraft.revisedInputs.timePreference}
                  onChange={(event) => updateDraftInput('timePreference', event.target.value as QuoteInputs['timePreference'])}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 bg-white"
                >
                  {timeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Frequency</span>
                <select
                  value={firmQuoteDraft.revisedInputs.frequency}
                  onChange={(event) => updateDraftInput('frequency', event.target.value as QuoteInputs['frequency'])}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 bg-white"
                >
                  {frequencyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Global mopping rate (min / sqm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  value={firmQuoteDraft.moppingMinutesPerSqm}
                  onChange={(event) => setFirmQuoteDraft((current) => ({
                    ...current,
                    moppingMinutesPerSqm: Math.max(0, Number(event.target.value || 0)),
                  }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
                <span className="mt-1 block text-xs text-gray-500">Applied to every room where mopping is included.</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Adjustment %</span>
                <input
                  type="number"
                  step="0.1"
                  value={firmQuoteDraft.pricingAdjustmentPercent}
                  onChange={(event) => setFirmQuoteDraft((current) => ({ ...current, pricingAdjustmentPercent: Number(event.target.value || 0) }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Target price (optional)</span>
                <input
                  value={firmQuoteDraft.targetPrice}
                  onChange={(event) => setFirmQuoteDraft((current) => ({ ...current, targetPrice: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: '#1a2744' }}>Room Types / Areas</h3>
                  <p className="text-sm text-gray-600">Add or remove room groups. Client sqm is reference-only; working pricing uses the selected room areas and room charges.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addRoom('office')}
                    className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
                  >
                    + Area
                  </button>
                  <button
                    type="button"
                    onClick={() => addRoom('bathroom')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                  >
                    + Bathroom
                  </button>
                  <button
                    type="button"
                    onClick={() => addRoom('kitchen')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                  >
                    + Kitchen
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {firmQuoteDraft.roomItems.map((room) => (
                  <details key={room.id} className="rounded-xl border border-gray-200">
                    <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-semibold" style={{ color: '#1a2744' }}>{room.label || room.type}</div>
                          <div className="mt-1 text-sm text-gray-500">
                            {room.type} · Quantity {room.quantity} · {room.size} sqm each
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-500">Expand / collapse</span>
                      </div>
                    </summary>
                    <div className="border-t border-gray-200 p-4">
                    {(() => {
                      const typeConfig = getRoomTypeConfigById(roomTypeConfig, room.type)
                      const canPriceMopping = Boolean(typeConfig?.tracksSize)
                      const internalRoomPrice = roomPricingBreakdown[room.id]
                      const roomPricingCode = ['bathroom', 'female_bathroom', 'male_bathroom', 'accessible_bathroom'].includes(room.type)
                        ? 'bathrooms'
                        : room.type === 'kitchen' ? 'kitchens' : null
                      const roomPricingRate = roomPricingCode
                        ? pricingConfig.items.find((item) => item.code === roomPricingCode && item.active)?.rate ?? 0
                        : 0
                      return (
                        <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_minmax(220px,1.7fr)_78px_96px_88px_104px] xl:items-end">
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-gray-700">Room type</span>
                        <select
                          value={room.type}
                          onChange={(event) => {
                            const nextType = event.target.value as WorkflowRoomType
                            const nextTypeConfig = getRoomTypeConfigById(roomTypeConfig, nextType)
                            updateRoom(room.id, {
                              type: nextType,
                              label: nextTypeConfig?.defaultLabel ?? nextTypeConfig?.label ?? room.label,
                              size: nextTypeConfig?.defaultSize ?? 0,
                              metrics: Object.fromEntries((nextTypeConfig?.fields ?? []).map((field) => [field.id, field.defaultValue])),
                              customMetricFields: [],
                              excludedMetricFieldIds: [],
                              moppingEnabled: nextTypeConfig?.defaultMopping ?? false,
                              pricingOverride: false,
                              pricingAdjustmentPercent: nextTypeConfig?.pricingAdjustmentPercent ?? 0,
                              fixedPricePerVisit: nextTypeConfig?.fixedPricePerVisit ?? 0,
                            })
                          }}
                          className="w-full rounded-xl border border-gray-300 px-3 py-3 bg-white"
                        >
                          {roomTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="text-sm xl:min-w-0">
                        <span className="mb-1 block font-medium text-gray-700">Label</span>
                        <input
                          value={room.label}
                          onChange={(event) => updateRoom(room.id, { label: event.target.value })}
                          className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-3"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-gray-700">Qty</span>
                        <input
                          type="number"
                          min="1"
                          value={room.quantity}
                          onChange={(event) => updateRoom(room.id, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-3"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-gray-700">sqm each</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={room.size}
                          onChange={(event) => updateRoom(room.id, { size: Math.max(0, Number(event.target.value || 0)) })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-3"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-gray-700">Floor</span>
                        <input
                          type="number"
                          min="1"
                          value={room.floor}
                          onChange={(event) => updateRoom(room.id, { floor: Math.max(1, Number(event.target.value || 1)) })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-3"
                        />
                      </label>
                      <div className="flex items-end md:col-span-2 xl:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeRoom(room.id)}
                          disabled={firmQuoteDraft.roomItems.length === 1}
                          className="w-full rounded-xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {internalRoomPrice ? (
                      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Internal room value (labour + room charges)</div>
                          <div className="mt-1 text-lg font-bold text-indigo-950">
                            {formatPriceRange(internalRoomPrice.low, internalRoomPrice.high)} per visit
                          </div>
                          {roomPricingRate > 0 ? (
                            <div className="mt-1 text-xs text-indigo-700">
                              {roomPricingCode === 'bathrooms' ? 'Bathroom charge' : 'Room charge'}: {formatCurrency(roomPricingRate)} each · {formatCurrency(roomPricingRate * room.quantity)} total
                            </div>
                          ) : null}
                        </div>
                        <div className="text-xs text-indigo-700">Admin calculation only · not shown to clients</div>
                      </div>
                    ) : null}
                    <label className="mt-4 block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Client-facing room description</span>
                      <textarea
                        value={room.description ?? ''}
                        onChange={(event) => updateRoom(room.id, { description: event.target.value })}
                        rows={2}
                        placeholder="Optional description shown to the client for this area"
                        className="w-full rounded-xl border border-gray-300 px-3 py-3"
                      />
                    </label>
                    {canPriceMopping ? (
                      <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                        <label className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={room.moppingEnabled ?? false}
                            onChange={(event) => updateRoom(room.id, { moppingEnabled: event.target.checked })}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                          />
                          <span>
                            <span className="block font-medium text-gray-800">Include mopping for this room</span>
                            <span className="mt-1 block text-xs text-gray-500">
                              Mopping uses the global quote rate above and the room area selected here.
                            </span>
                          </span>
                        </label>
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-gray-700">Room pricing rule</span>
                          <select
                            value={room.pricingOverride ? 'override' : 'default'}
                            onChange={(event) => {
                              const useOverride = event.target.value === 'override'
                              updateRoom(room.id, {
                                pricingOverride: useOverride,
                                pricingAdjustmentPercent: useOverride
                                  ? room.pricingAdjustmentPercent ?? typeConfig?.pricingAdjustmentPercent ?? 0
                                  : room.pricingAdjustmentPercent,
                                fixedPricePerVisit: useOverride
                                  ? room.fixedPricePerVisit ?? typeConfig?.fixedPricePerVisit ?? 0
                                  : room.fixedPricePerVisit,
                              })
                            }}
                            className="w-full rounded-xl border border-gray-300 px-3 py-3 bg-white"
                          >
                            <option value="default">Use {typeConfig?.label ?? room.type} default</option>
                            <option value="override">Override for this room</option>
                          </select>
                          <span className="mt-1 block text-xs text-gray-500">
                            Default: {typeConfig?.pricingAdjustmentPercent ?? 0}% plus {formatCurrency(typeConfig?.fixedPricePerVisit ?? 0)} per room / visit.
                          </span>
                        </label>
                        {room.pricingOverride ? (
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm">
                              <span className="mb-1 block font-medium text-gray-700">Adjust %</span>
                              <input
                                type="number"
                                step="0.1"
                                value={room.pricingAdjustmentPercent ?? 0}
                                onChange={(event) => updateRoom(room.id, { pricingAdjustmentPercent: Number(event.target.value || 0) })}
                                className="w-full rounded-xl border border-gray-300 px-3 py-3"
                              />
                            </label>
                            <label className="text-sm">
                              <span className="mb-1 block font-medium text-gray-700">Fixed $</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={room.fixedPricePerVisit ?? 0}
                                onChange={(event) => updateRoom(room.id, { fixedPricePerVisit: Math.max(0, Number(event.target.value || 0)) })}
                                className="w-full rounded-xl border border-gray-300 px-3 py-3"
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-gray-200 p-3">
                      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Extra fields</div>
                          <div className="text-xs text-gray-500">Use a saved room field or add a blank one for this quote.</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (event.target.value) addSystemMetricField(room, event.target.value)
                              event.target.value = ''
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold"
                          >
                            <option value="">Add saved field…</option>
                            {systemMetricFieldOptions.filter((field) => !getWorkflowRoomMetricFields(room, roomTypeConfig).some((active) => active.id === field.id)).map((field) => (
                              <option key={field.id} value={field.id}>{field.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => addBlankMetricField(room)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">
                            + Blank field
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {getWorkflowRoomMetricFields(room, roomTypeConfig).map((field) => {
                          const isCustom = (room.customMetricFields ?? []).some((candidate) => candidate.id === field.id)
                          return (
                          <div key={field.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              {isCustom ? (
                                <input value={field.label} onChange={(event) => updateCustomMetricField(room, field.id, { label: event.target.value })} aria-label="Custom field label" className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 font-medium" />
                              ) : <span className="font-medium text-gray-700">{field.label}</span>}
                              <button type="button" onClick={() => removeMetricField(room, field.id)} className="text-xs font-semibold text-red-600">Remove</button>
                            </div>
                            {field.inputType === 'boolean' ? (
                              <select
                                value={room.metrics?.[field.id] === true ? 'true' : 'false'}
                                onChange={(event) => updateRoom(room.id, {
                                  metrics: {
                                    ...(room.metrics ?? {}),
                                    [field.id]: event.target.value === 'true',
                                  },
                                })}
                                className="w-full rounded-xl border border-gray-300 px-3 py-3 bg-white"
                              >
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                              </select>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step={field.inputType === 'integer' ? 1 : 0.1}
                                value={String(room.metrics?.[field.id] ?? field.defaultValue ?? 0)}
                                onChange={(event) => updateRoom(room.id, {
                                  metrics: {
                                    ...(room.metrics ?? {}),
                                    [field.id]: Number(event.target.value || 0),
                                  },
                                })}
                                className="w-full rounded-xl border border-gray-300 px-3 py-3"
                              />
                            )}
                            {isCustom ? (
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                <label className="text-xs text-gray-500">Price / unit<input type="number" min="0" step="0.1" value={field.pricePerUnit ?? 0} onChange={(event) => updateCustomMetricField(room, field.id, { pricePerUnit: Math.max(0, Number(event.target.value || 0)) })} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" /></label>
                                <label className="text-xs text-gray-500">Included<input type="number" min="0" step="1" value={field.includedUnits ?? 0} onChange={(event) => updateCustomMetricField(room, field.id, { includedUnits: Math.max(0, Number(event.target.value || 0)) })} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" /></label>
                                <label className="text-xs text-gray-500">Frequency<select value={field.cadence ?? 'every_clean'} onChange={(event) => updateCustomMetricField(room, field.id, { cadence: event.target.value as RoomTaskCadence })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5">{ROOM_TASK_CADENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                              </div>
                            ) : null}
                            <span className="mt-1 block text-xs text-gray-500">{field.helpText?.trim() ? field.helpText : describeFieldPricing(field.label, field.pricePerUnit)} · {getRoomTaskCadenceLabel(field.cadence ?? 'every_clean')}</span>
                          </div>
                        )})}
                        {getWorkflowRoomMetricFields(room, roomTypeConfig).length === 0 ? <div className="text-xs text-gray-500">No extra fields selected.</div> : null}
                      </div>
                    </div>
                        </>
                      )
                    })()}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <div className="text-sm text-gray-500">Client total floor area (reference)</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{quote.inputs.floorArea} sqm</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Selected room area priced</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{getRoomAreaAllocationTotal(firmQuoteDraft, roomTypeConfig)} sqm</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Bathrooms</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{derivedInputs.addOns.bathrooms}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Kitchens / breakout</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{derivedInputs.addOns.kitchens}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Floors</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{derivedInputs.floors}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                Working pricing uses the selected room areas and room charges below. The client total is retained as a reference for site inspection confirmation; minimum call-out still applies.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 mt-5">
                <div>
                  <div className="text-sm text-gray-500">Original instant estimate</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{originalSummary(quote.result)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Revised working range</div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {formatCurrency(preview.adjustedLow)} – {formatCurrency(preview.adjustedHigh)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Room field extras</div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {formatCurrency(preview.roomFieldExtraTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Scheduled task extras (amortised)</div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {formatCurrency(preview.scheduledTaskExtraTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Mopping extras</div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {formatCurrency(preview.moppingExtraTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Room pricing adjustments</div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {formatPriceRange(preview.roomPricingExtraLow, preview.roomPricingExtraHigh)}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-sm text-gray-500">Actual calculated total before minimum call-out</div>
                  <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>
                    {formatCurrency(preview.calculatedLow)} – {formatCurrency(preview.calculatedHigh)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Includes room charges, extras, mopping, and quote adjustments.</div>
                </div>
                <label className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm">
                  <span className="mb-1 block font-semibold text-green-900">Final client price override (per visit)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={firmQuoteDraft.finalPerVisit}
                    onChange={(event) => setFirmQuoteDraft((current) => ({ ...current, finalPerVisit: event.target.value }))}
                    placeholder="Leave blank to use the revised range"
                    className="w-full rounded-xl border border-green-300 bg-white px-4 py-3"
                  />
                  <span className="mt-1 block text-xs text-green-800">Enter the price to show the client after the site inspection. This replaces the estimated range.</span>
                </label>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm">
                <span className="mb-1 flex flex-wrap items-center gap-2 font-medium text-gray-700">
                  Scope summary
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Client visible</span>
                </span>
                <textarea
                  value={firmQuoteDraft.scopeSummary}
                  onChange={(event) => setFirmQuoteDraft((current) => ({ ...current, scopeSummary: event.target.value }))}
                  rows={4}
                  placeholder="Summarise the agreed services, important exclusions, and assumptions in client-ready language."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
                <span className="mt-1 block text-xs text-gray-500">This appears in the client scope. Do not include keys, alarm details, hazards, staff actions, or other internal notes.</span>
              </label>
            </div>
            </div>
          </details>

        </div>
      </div>

      {!quote.workflowColumnsAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Workflow storage has not been migrated in the database yet. This page is ready, but saving will stay blocked until the quote workflow migration is applied.
        </div>
      ) : null}

      {saveState.message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {saveState.message}
        </div>
      ) : null}
      {saveState.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveState.error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openPreview()}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
          >
            Preview firm quote
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState.saving || finalPublished || firmQuoteDraft.status === 'sent' || firmQuoteDraft.status === 'accepted'}
            className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saveState.saving ? 'Saving workflow…' : finalPublished ? 'Final document locked' : firmQuoteDraft.status === 'reviewed' ? 'Publish reviewed final' : 'Save + open preview'}
          </button>
        </div>
      </div>
    </div>
  )
}
