'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CleanerComment,
  CleanerDocument,
  CleanerEmail,
  CleanerEmailTemplate,
  CleanerRecord,
  CleanerStatus,
} from '@/lib/cleaners'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

type CleanerDetail = {
  cleaner: CleanerRecord
  comments: CleanerComment[]
  emails: CleanerEmail[]
  documents: CleanerDocument[]
}

type Props = {
  initialCleaners: CleanerRecord[]
  initialTotal: number
  initialPage: number
  initialPageSize: number
  initialTemplates: CleanerEmailTemplate[]
  initialSelected: CleanerDetail | null
}

type CleanerFormState = {
  businessName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  alternatePhone: string
  address: string
  suburb: string
  postcode: string
  city: string
  state: string
  abn: string
  status: CleanerStatus
  services: string
  serviceAreas: string
  preferredWork: string
  complianceStatus: string
  insuranceExpiry: string
  policeCheckExpiry: string
  inductionExpiry: string
  workingWithChildrenCheck: boolean
  internalOwner: string
  rating: string
  notes: string
}

type DocumentDraftState = {
  documentType: string
  expiryDate: string
  notes: string
  file: File | null
  replaceDocumentId: string | null
  replaceFileName: string
}

type CleanerModalTab = 'details' | 'documents' | 'comments' | 'email'

const statusOptions: Array<{ value: CleanerStatus; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'paused', label: 'Paused' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'inactive', label: 'Inactive' },
]

const serviceOptions = ['office', 'medical', 'childcare', 'industrial', 'retail', 'gym', 'warehouse', 'after_hours', 'weekend']
const complianceOptions = ['current', 'docs_due', 'expired', 'not_checked']
const pageSizeOptions = [25, 50, 100, 200]
const wwccFilterOptions = [
  { value: 'all', label: 'All WWCC' },
  { value: 'checked', label: 'WWCC checked' },
  { value: 'missing', label: 'WWCC missing' },
]
const expiryFilterOptions = [
  { value: 'all', label: 'All expiry dates' },
  { value: 'any_expired', label: 'Any expired' },
  { value: 'any_expiring_30', label: 'Expiring 30 days' },
  { value: 'insurance_expired', label: 'Insurance expired' },
  { value: 'police_expired', label: 'Police expired' },
  { value: 'induction_expired', label: 'Induction expired' },
]
const documentTypeOptions = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'police_check', label: 'Police check' },
  { value: 'induction', label: 'Induction' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
]
const australianStates = [
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NSW', label: 'New South Wales' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'WA', label: 'Western Australia' },
]
const citySuggestions = ['Adelaide', 'Brisbane', 'Canberra', 'Darwin', 'Hobart', 'Melbourne', 'Perth', 'Sydney']

type AdminLocalitySuggestion = {
  label: string
  suburb: string
  postcode: string
  city?: string | null
  state?: string | null
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

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

function formatBytes(value?: number | null) {
  if (!value) return '—'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function getDocumentExpiryStatus(value?: string | null) {
  if (!value) {
    return {
      label: 'No expiry',
      tone: 'bg-gray-100 text-gray-700',
    }
  }

  const expiryDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) {
    return {
      label: 'Check date',
      tone: 'bg-amber-100 text-amber-800',
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return {
      label: 'Expired',
      tone: 'bg-red-100 text-red-700',
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      label: 'Expires soon',
      tone: 'bg-amber-100 text-amber-800',
    }
  }

  return {
    label: 'Current',
    tone: 'bg-green-100 text-green-700',
  }
}

function getCleanerComplianceFlags(cleaner: CleanerRecord) {
  const flags: Array<{ label: string; tone: string }> = []
  const expiries = [
    { label: 'Insurance', value: cleaner.insurance_expiry },
    { label: 'Police', value: cleaner.police_check_expiry },
    { label: 'Induction', value: cleaner.induction_expiry },
  ]

  expiries.forEach((expiry) => {
    const status = getDocumentExpiryStatus(expiry.value)
    if (status.label === 'Expired' || status.label === 'Expires soon') {
      flags.push({
        label: `${expiry.label} ${status.label.toLowerCase()}`,
        tone: status.tone,
      })
    }
  })

  if (!cleaner.working_with_children_check) {
    flags.push({
      label: 'WWCC missing',
      tone: 'bg-amber-100 text-amber-800',
    })
  }

  return flags
}

function toCsv(values?: string[] | null) {
  return values?.join(', ') ?? ''
}

function fromCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitContactName(value?: string | null) {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function getCleanerDisplayName(cleaner: CleanerRecord) {
  return [cleaner.first_name, cleaner.last_name].filter(Boolean).join(' ').trim() || cleaner.contact_name
}

function getCleanerInitials(cleaner: CleanerRecord) {
  const name = getCleanerDisplayName(cleaner)
  const parts = name.split(/\s+/).filter(Boolean)
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)
  return initials.toUpperCase()
}

function toFormState(cleaner?: CleanerRecord | null): CleanerFormState {
  const fallbackName = splitContactName(cleaner?.contact_name)
  return {
    businessName: cleaner?.business_name ?? '',
    firstName: cleaner?.first_name ?? fallbackName.firstName,
    lastName: cleaner?.last_name ?? fallbackName.lastName,
    email: cleaner?.email ?? '',
    phone: cleaner?.phone ?? '',
    alternatePhone: cleaner?.alternate_phone ?? '',
    address: cleaner?.address ?? '',
    suburb: cleaner?.suburb ?? '',
    postcode: cleaner?.postcode ?? '',
    city: cleaner?.city ?? 'Melbourne',
    state: cleaner?.state ?? 'VIC',
    abn: cleaner?.abn ?? '',
    status: cleaner?.status ?? 'lead',
    services: toCsv(cleaner?.services),
    serviceAreas: toCsv(cleaner?.service_areas),
    preferredWork: cleaner?.preferred_work ?? '',
    complianceStatus: cleaner?.compliance_status ?? 'not_checked',
    insuranceExpiry: cleaner?.insurance_expiry ?? '',
    policeCheckExpiry: cleaner?.police_check_expiry ?? '',
    inductionExpiry: cleaner?.induction_expiry ?? '',
    workingWithChildrenCheck: cleaner?.working_with_children_check ?? false,
    internalOwner: cleaner?.internal_owner ?? '',
    rating: cleaner?.rating ? String(cleaner.rating) : '',
    notes: cleaner?.notes ?? '',
  }
}

function createDocumentDraft(overrides: Partial<DocumentDraftState> = {}): DocumentDraftState {
  return {
    documentType: 'insurance',
    expiryDate: '',
    notes: '',
    file: null,
    replaceDocumentId: null,
    replaceFileName: '',
    ...overrides,
  }
}

function buildEmailDraft(template: CleanerEmailTemplate | null, cleaner: CleanerRecord | null) {
  const applyTokens = (value: string) => {
    if (!cleaner) return value
    return value
      .replaceAll('{{first_name}}', cleaner.first_name ?? splitContactName(cleaner.contact_name).firstName)
      .replaceAll('{{last_name}}', cleaner.last_name ?? splitContactName(cleaner.contact_name).lastName)
      .replaceAll('{{contact_name}}', cleaner.contact_name)
      .replaceAll('{{business_name}}', cleaner.business_name)
      .replaceAll('{{city}}', cleaner.city ?? '')
      .replaceAll('{{suburb}}', cleaner.suburb ?? '')
      .replaceAll('{{state}}', cleaner.state ?? '')
  }

  return {
    templateId: template?.id ?? '',
    templateName: template?.name ?? '',
    subject: applyTokens(template?.subject ?? ''),
    body: applyTokens(template?.body ?? ''),
  }
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function normaliseCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function splitCsvList(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsvBoolean(value: string) {
  return ['yes', 'true', '1', 'y', 'checked', 'current'].includes(value.trim().toLowerCase())
}

function parseCleanerCsvRecords(text: string) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one cleaner row.')
  }

  const headers = rows[0].map(normaliseCsvHeader)
  return rows.slice(1).map((row) => {
    const values = new Map(headers.map((header, index) => [header, row[index]?.trim() ?? '']))
    const value = (...keys: string[]) => keys.map((key) => values.get(key) ?? '').find(Boolean) ?? ''
    const rating = value('rating')

    return {
      businessName: value('business_name', 'business'),
      firstName: value('first_name', 'firstname', 'given_name'),
      lastName: value('last_name', 'surname', 'family_name'),
      contactName: value('contact_name', 'contact'),
      email: value('email', 'email_address'),
      phone: value('phone', 'mobile', 'contact_number'),
      alternatePhone: value('alternate_phone', 'alternate_number', 'other_phone'),
      address: value('address', 'street_address'),
      suburb: value('suburb'),
      postcode: value('postcode', 'post_code'),
      city: value('city'),
      state: value('state'),
      abn: value('abn'),
      status: value('status') || 'lead',
      services: splitCsvList(value('services')),
      serviceAreas: splitCsvList(value('service_areas', 'areas', 'notification_areas')),
      preferredWork: value('preferred_work', 'preferred'),
      complianceStatus: value('compliance_status', 'compliance') || 'not_checked',
      insuranceExpiry: value('insurance_expiry', 'insurance_expiry_date'),
      policeCheckExpiry: value('police_check_expiry', 'police_expiry', 'police_check_expiry_date'),
      inductionExpiry: value('induction_expiry', 'induction_expiry_date'),
      workingWithChildrenCheck: parseCsvBoolean(value('working_with_children_check', 'wwcc')),
      internalOwner: value('internal_owner', 'owner'),
      rating: rating ? Number(rating) : null,
      notes: value('notes', 'comments'),
    }
  })
}

function AdminLocalityAutocomplete({
  city,
  state,
  suburb,
  postcode,
  onChange,
}: {
  city: string
  state: string
  suburb: string
  postcode: string
  onChange: (updates: { city?: string; state?: string; suburb: string; postcode: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AdminLocalitySuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          query,
          city,
          state,
        })
        const response = await fetch(`/api/admin/locality-autocomplete?${params.toString()}`, {
          headers: getAdminHeaders(),
          signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load suburb suggestions')

        const nextSuggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as AdminLocalitySuggestion[])
          : []
        setSuggestions(nextSuggestions)
        setIsOpen(nextSuggestions.length > 0)
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setIsOpen(false)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [city, query, state])

  useEffect(() => {
    if (suburb && postcode && !query) {
      setQuery(`${suburb} ${postcode}`)
    }
  }, [postcode, query, suburb])

  function applySuggestion(suggestion: AdminLocalitySuggestion) {
    onChange({
      city: suggestion.city ?? city,
      state: suggestion.state ?? state,
      suburb: suggestion.suburb,
      postcode: suggestion.postcode,
    })
    setQuery(suggestion.label)
    setSuggestions([])
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative md:col-span-2">
      <label className="space-y-1 text-sm font-medium text-gray-700">
        Suburb / postcode lookup
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true)
          }}
          placeholder="Start typing a suburb or postcode..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
        />
      </label>
      <p className="mt-1 text-xs text-gray-500">
        {isLoading ? 'Searching known Australian localities...' : 'Pick a suggestion to fill suburb, postcode, city and state.'}
      </p>
      {isOpen && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.suburb}-${suggestion.postcode}-${suggestion.state}-${index}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySuggestion(suggestion)}
              className="w-full border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 last:border-b-0 hover:bg-gray-50"
            >
              <div className="font-semibold text-gray-900">{suggestion.suburb}</div>
              <div className="mt-1 text-xs text-gray-500">
                {[suggestion.postcode, suggestion.city, suggestion.state].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function statusTone(status: string) {
  if (status === 'approved' || status === 'sent' || status === 'delivered') return 'bg-green-100 text-green-700'
  if (status === 'paused' || status === 'docs_due' || status === 'opened') return 'bg-amber-100 text-amber-800'
  if (status === 'rejected' || status === 'inactive' || status === 'failed' || status === 'expired') return 'bg-red-100 text-red-700'
  return 'bg-blue-100 text-blue-700'
}

export default function CleanersAdmin({ initialCleaners, initialTotal, initialPage, initialPageSize, initialTemplates, initialSelected }: Props) {
  const [cleaners, setCleaners] = useState(initialCleaners)
  const [templates] = useState(initialTemplates)
  const [selectedDetail, setSelectedDetail] = useState<CleanerDetail | null>(initialSelected)
  const [editingId, setEditingId] = useState<string | null>(initialSelected?.cleaner.id ?? null)
  const [form, setForm] = useState<CleanerFormState>(toFormState(initialSelected?.cleaner))
  const [filters, setFilters] = useState({
    query: '',
    city: 'all',
    state: 'all',
    status: 'all',
    service: 'all',
    compliance: 'all',
    wwcc: 'all',
    expiry: 'all',
  })
  const [commentDraft, setCommentDraft] = useState('')
  const [documentDraft, setDocumentDraft] = useState<DocumentDraftState>(createDocumentDraft())
  const [emailDraft, setEmailDraft] = useState(buildEmailDraft(templates[0] ?? null, initialSelected?.cleaner ?? null))
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isCleaningSamples, setIsCleaningSamples] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<CleanerModalTab>('details')
  const [pagination, setPagination] = useState({
    page: initialPage || 1,
    pageSize: pageSizeOptions.includes(initialPageSize) ? initialPageSize : 50,
    total: initialTotal ?? initialCleaners.length,
  })
  const topDirectoryScrollRef = useRef<HTMLDivElement | null>(null)
  const tableDirectoryScrollRef = useRef<HTMLDivElement | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)

  const selectedCleaner = selectedDetail?.cleaner ?? null

  const stats = useMemo(() => {
    return {
      total: cleaners.length,
      approved: cleaners.filter((cleaner) => cleaner.status === 'approved').length,
      docsDue: cleaners.filter((cleaner) => ['docs_due', 'expired'].includes(cleaner.compliance_status ?? '')).length,
      emails: selectedDetail?.emails.length ?? 0,
    }
  }, [cleaners, selectedDetail])

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const visibleFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const visibleTo = Math.min(pagination.page * pagination.pageSize, pagination.total)
  const modalTabs: Array<{ value: CleanerModalTab; label: string }> = [
    { value: 'details', label: 'Details' },
    { value: 'documents', label: `Documents (${selectedDetail?.documents.length ?? 0})` },
    { value: 'comments', label: `Comments (${selectedDetail?.comments.length ?? 0})` },
    { value: 'email', label: `Email (${selectedDetail?.emails.length ?? 0})` },
  ]

  function setField<K extends keyof CleanerFormState>(key: K, value: CleanerFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function syncDirectoryScroll(source: 'top' | 'table') {
    const from = source === 'top' ? topDirectoryScrollRef.current : tableDirectoryScrollRef.current
    const to = source === 'top' ? tableDirectoryScrollRef.current : topDirectoryScrollRef.current
    if (!from || !to || to.scrollLeft === from.scrollLeft) return
    to.scrollLeft = from.scrollLeft
  }

  function startCreate() {
    setEditingId(null)
    const next = toFormState(null)
    setForm(next)
    setSelectedDetail(null)
    setCommentDraft('')
    setDocumentDraft(createDocumentDraft())
    setEmailDraft(buildEmailDraft(templates[0] ?? null, null))
    setStatus({ type: 'idle', message: '' })
    setModalTab('details')
    setIsModalOpen(true)
  }

  async function loadCleaner(cleanerId: string) {
    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`/api/admin/cleaners/${cleanerId}`, {
        headers: getAdminHeaders(),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to load cleaner.')
      }

      const detail = {
        cleaner: result.cleaner as CleanerRecord,
        comments: result.comments as CleanerComment[],
        emails: result.emails as CleanerEmail[],
        documents: result.documents as CleanerDocument[],
      }
      setSelectedDetail(detail)
      setEditingId(detail.cleaner.id)
      setForm(toFormState(detail.cleaner))
      setEmailDraft(buildEmailDraft(templates[0] ?? null, detail.cleaner))
      setCommentDraft('')
      setDocumentDraft(createDocumentDraft())
      setModalTab('details')
      setIsModalOpen(true)
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load cleaner.' })
    } finally {
      setIsLoading(false)
    }
  }

  async function search(nextPage = pagination.page, nextPageSize = pagination.pageSize) {
    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const params = new URLSearchParams(filters)
      params.set('page', String(nextPage))
      params.set('pageSize', String(nextPageSize))
      const response = await fetch(`/api/admin/cleaners?${params.toString()}`, {
        headers: getAdminHeaders(),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Search failed.')
      }

      setCleaners(result.cleaners as CleanerRecord[])
      setPagination({
        page: Number(result.page ?? nextPage),
        pageSize: Number(result.pageSize ?? nextPageSize),
        total: Number(result.total ?? result.cleaners?.length ?? 0),
      })
      setStatus({ type: 'success', message: 'Cleaner search updated.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Search failed.' })
    } finally {
      setIsLoading(false)
    }
  }

  async function cleanupSampleCleaners() {
    const confirmed = window.confirm('Remove only generated sample cleaner records? Real records are not touched.')
    if (!confirmed) return

    setIsCleaningSamples(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/cleaners?mode=sample-cleaners', {
        method: 'DELETE',
        headers: getAdminHeaders(),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to remove sample cleaners.')
      }

      await search(1, pagination.pageSize)
      setStatus({ type: 'success', message: `Removed ${result.deletedCount ?? 0} sample cleaner records.` })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to remove sample cleaners.' })
    } finally {
      setIsCleaningSamples(false)
    }
  }

  async function exportCleaners() {
    setIsExporting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/cleaners/export', {
        headers: getAdminHeaders(),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || 'Unable to export cleaners.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `secure-cleaning-cleaners-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setStatus({ type: 'success', message: 'Cleaner CSV export downloaded.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to export cleaners.' })
    } finally {
      setIsExporting(false)
    }
  }

  async function importCleanerCsv(file: File | null) {
    if (!file) return
    setIsImporting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const text = await file.text()
      const records = parseCleanerCsvRecords(text)
      const response = await fetch('/api/admin/cleaners/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ records }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to import cleaners.')
      }

      await search(1, pagination.pageSize)
      const warnings = Array.isArray(result.errors) && result.errors.length > 0
        ? ` ${result.errors.slice(0, 3).join(' ')}`
        : ''
      setStatus({
        type: 'success',
        message: `Imported cleaners: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.${warnings}`,
      })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to import cleaners.' })
    } finally {
      setIsImporting(false)
      if (importFileRef.current) {
        importFileRef.current.value = ''
      }
    }
  }

  async function saveCleaner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const payload = {
        businessName: form.businessName,
        firstName: form.firstName,
        lastName: form.lastName,
        contactName: [form.firstName, form.lastName].filter(Boolean).join(' '),
        email: form.email,
        phone: form.phone,
        alternatePhone: form.alternatePhone,
        address: form.address,
        suburb: form.suburb,
        postcode: form.postcode,
        city: form.city,
        state: form.state,
        abn: form.abn,
        status: form.status,
        services: fromCsv(form.services),
        serviceAreas: fromCsv(form.serviceAreas),
        preferredWork: form.preferredWork,
        complianceStatus: form.complianceStatus,
        insuranceExpiry: form.insuranceExpiry || null,
        policeCheckExpiry: form.policeCheckExpiry || null,
        inductionExpiry: form.inductionExpiry || null,
        workingWithChildrenCheck: form.workingWithChildrenCheck,
        internalOwner: form.internalOwner,
        rating: form.rating ? Number(form.rating) : null,
        notes: form.notes,
      }

      const response = await fetch(editingId ? `/api/admin/cleaners/${editingId}` : '/api/admin/cleaners', {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Save failed.')
      }

      const cleaner = result.cleaner as CleanerRecord
      setCleaners((current) => {
        const exists = current.some((item) => item.id === cleaner.id)
        return exists ? current.map((item) => (item.id === cleaner.id ? cleaner : item)) : [cleaner, ...current]
      })
      setEditingId(cleaner.id)
      setSelectedDetail((current) => ({
        cleaner,
        comments: current?.cleaner.id === cleaner.id ? current.comments : [],
        emails: current?.cleaner.id === cleaner.id ? current.emails : [],
        documents: current?.cleaner.id === cleaner.id ? current.documents : [],
      }))
      setEmailDraft(buildEmailDraft(templates[0] ?? null, cleaner))
      setStatus({ type: 'success', message: editingId ? 'Cleaner updated.' : 'Cleaner created.' })
      if (!editingId) {
        setModalTab('documents')
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Save failed.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function addComment() {
    if (!selectedCleaner) return
    setIsSaving(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`/api/admin/cleaners/${selectedCleaner.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ comment: commentDraft, authorName: 'Admin' }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to add comment.')
      }

      setSelectedDetail((current) => current ? { ...current, comments: [result.comment as CleanerComment, ...current.comments] } : current)
      setCommentDraft('')
      setStatus({ type: 'success', message: 'Comment added.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add comment.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function uploadDocument() {
    if (!selectedCleaner || !documentDraft.file) return
    setIsUploading(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const formData = new FormData()
      formData.set('documentType', documentDraft.documentType)
      formData.set('expiryDate', documentDraft.expiryDate)
      formData.set('notes', documentDraft.notes)
      formData.set('uploadedBy', 'Admin')
      formData.set('file', documentDraft.file)
      if (documentDraft.replaceDocumentId) {
        formData.set('replaceDocumentId', documentDraft.replaceDocumentId)
      }

      const response = await fetch(`/api/admin/cleaners/${selectedCleaner.id}/documents`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to upload document.')
      }

      const replacedDocumentId = typeof result.replacedDocumentId === 'string' ? result.replacedDocumentId : null
      setSelectedDetail((current) => current ? {
        ...current,
        documents: [
          result.document as CleanerDocument,
          ...current.documents.filter((document) => document.id !== replacedDocumentId),
        ],
      } : current)
      setDocumentDraft(createDocumentDraft({ documentType: documentDraft.documentType }))
      setStatus({ type: 'success', message: replacedDocumentId ? 'Document replaced.' : 'Document uploaded.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to upload document.' })
    } finally {
      setIsUploading(false)
    }
  }

  function startReplacingDocument(cleanerDocument: CleanerDocument) {
    setDocumentDraft(createDocumentDraft({
      documentType: cleanerDocument.document_type,
      expiryDate: cleanerDocument.expiry_date ?? '',
      notes: cleanerDocument.notes ? `Replacement for ${cleanerDocument.file_name}: ${cleanerDocument.notes}` : `Replacement for ${cleanerDocument.file_name}`,
      replaceDocumentId: cleanerDocument.id,
      replaceFileName: cleanerDocument.file_name,
    }))
    setStatus({ type: 'idle', message: '' })
    window.setTimeout(() => {
      document.getElementById('cleaner-document-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  function cancelDocumentReplacement() {
    setDocumentDraft(createDocumentDraft({ documentType: documentDraft.documentType }))
    setStatus({ type: 'idle', message: '' })
  }

  async function deleteDocument(document: CleanerDocument) {
    if (!selectedCleaner) return
    const confirmed = window.confirm(`Delete ${document.file_name}? This removes the stored file from this cleaner record.`)
    if (!confirmed) return

    setDeletingDocumentId(document.id)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`/api/admin/cleaners/${selectedCleaner.id}/documents/${document.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to delete document.')
      }

      setSelectedDetail((current) => current ? {
        ...current,
        documents: current.documents.filter((item) => item.id !== document.id),
      } : current)
      if (documentDraft.replaceDocumentId === document.id) {
        setDocumentDraft(createDocumentDraft({ documentType: documentDraft.documentType }))
      }
      setStatus({ type: 'success', message: 'Document deleted.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to delete document.' })
    } finally {
      setDeletingDocumentId(null)
    }
  }

  function selectTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId) ?? null
    setEmailDraft(buildEmailDraft(template, selectedCleaner))
  }

  async function sendEmail() {
    if (!selectedCleaner) return
    setIsSending(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`/api/admin/cleaners/${selectedCleaner.id}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify(emailDraft),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to send email.')
      }

      setSelectedDetail((current) => current ? { ...current, emails: [result.email as CleanerEmail, ...current.emails] } : current)
      setStatus({ type: 'success', message: 'Email sent and logged.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send email.' })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <h1 className="text-3xl font-bold" style={{ color: '#1a2744' }}>Cleaners</h1>
            <p className="pb-1 text-sm text-gray-600">Directory of cleaner records, compliance, notes, and email history.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-gray-600">
            <span className="rounded-full bg-gray-100 px-3 py-1">{stats.total} visible</span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{stats.approved} approved</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{stats.docsDue} docs due / expired</span>
          </div>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="h-11 rounded-full px-5 text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: '#12b76a' }}
        >
          + New Cleaner
        </button>
      </section>

      {status.message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          status.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
        }`}>
          {status.message}
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_repeat(6,minmax(130px,170px))_150px]">
            <input
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void search(1)
              }}
              placeholder="Search name, business, phone, suburb, email, ABN..."
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
            />
            <select value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              <option value="all">All states</option>
              {australianStates.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
            </select>
            <input
              list="cleaner-city-filter-options"
              value={filters.city === 'all' ? '' : filters.city}
              onChange={(event) => setFilters({ ...filters, city: event.target.value || 'all' })}
              placeholder="Any city"
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
            <datalist id="cleaner-city-filter-options">
              {citySuggestions.map((city) => <option key={city} value={city} />)}
            </datalist>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              <option value="all">All statuses</option>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={filters.service} onChange={(event) => setFilters({ ...filters, service: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              <option value="all">All services</option>
              {serviceOptions.map((option) => <option key={option} value={option}>{formatStatus(option)}</option>)}
            </select>
            <select value={filters.wwcc} onChange={(event) => setFilters({ ...filters, wwcc: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              {wwccFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={filters.expiry} onChange={(event) => setFilters({ ...filters, expiry: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              {expiryFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void search(1)}
              disabled={isLoading}
              className="rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: '#12b76a' }}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between">
            <div>
              Showing <span className="font-semibold text-gray-900">{visibleFrom}-{visibleTo}</span> of{' '}
              <span className="font-semibold text-gray-900">{pagination.total}</span> cleaner records
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Rows
                <select
                  value={pagination.pageSize}
                  onChange={(event) => void search(1, Number(event.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-gray-800"
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void search(Math.max(1, pagination.page - 1))}
                disabled={isLoading || pagination.page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-2 text-xs font-semibold text-gray-500">Page {pagination.page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => void search(Math.min(totalPages, pagination.page + 1))}
                disabled={isLoading || pagination.page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => void exportCleaners()}
                disabled={isExporting}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={isImporting}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {isImporting ? 'Importing...' : 'Import CSV'}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void importCleanerCsv(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => void cleanupSampleCleaners()}
                disabled={isCleaningSamples}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {isCleaningSamples ? 'Removing samples...' : 'Remove sample cleaners'}
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Scroll directory sideways to view all columns
            </div>
            <div className="text-xs text-gray-500">
              {cleaners.length} records on this page
            </div>
          </div>
          <div
            ref={topDirectoryScrollRef}
            onScroll={() => syncDirectoryScroll('top')}
            className="mt-2 overflow-x-auto"
          >
            <div className="h-2 min-w-[1560px]" />
          </div>
        </div>

        <div
          ref={tableDirectoryScrollRef}
          onScroll={() => syncDirectoryScroll('table')}
          className="overflow-x-auto"
        >
          <table className="min-w-[1560px] w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-30 w-24 bg-gray-50 px-4 py-3 font-bold shadow-[1px_0_0_0_rgba(229,231,235,1)]">Action</th>
                <th className="sticky left-24 z-30 w-32 bg-gray-50 px-4 py-3 font-bold shadow-[1px_0_0_0_rgba(229,231,235,1)]">Status</th>
                <th className="sticky left-56 z-30 min-w-[220px] bg-gray-50 px-4 py-3 font-bold shadow-[1px_0_0_0_rgba(229,231,235,1)]">Cleaner</th>
                <th className="min-w-[220px] px-4 py-3 font-bold">Business</th>
                <th className="min-w-[260px] px-4 py-3 font-bold">Notes</th>
                <th className="min-w-[150px] px-4 py-3 font-bold">Owner</th>
                <th className="min-w-[170px] px-4 py-3 font-bold">Compliance</th>
                <th className="min-w-[180px] px-4 py-3 font-bold">Areas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cleaners.map((cleaner) => {
                const complianceFlags = getCleanerComplianceFlags(cleaner)
                return (
                  <tr key={cleaner.id} className="group align-top hover:bg-gray-50">
                    <td className="sticky left-0 z-20 bg-white px-4 py-4 shadow-[1px_0_0_0_rgba(229,231,235,1)] group-hover:bg-gray-50">
                      <button
                        type="button"
                        onClick={() => void loadCleaner(cleaner.id)}
                        className="rounded-full bg-cyan-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        Edit
                      </button>
                    </td>
                    <td className="sticky left-24 z-20 bg-white px-4 py-4 shadow-[1px_0_0_0_rgba(229,231,235,1)] group-hover:bg-gray-50">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(cleaner.status)}`}>
                        {formatStatus(cleaner.status)}
                      </span>
                    </td>
                    <td className="sticky left-56 z-20 bg-white px-4 py-4 shadow-[1px_0_0_0_rgba(229,231,235,1)] group-hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-bold text-blue-600">
                          {getCleanerInitials(cleaner)}
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => void loadCleaner(cleaner.id)}
                            className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                          >
                            {getCleanerDisplayName(cleaner)}
                          </button>
                          <div className="mt-1 text-xs text-gray-500">{cleaner.email}</div>
                          <div className="mt-1 text-xs text-gray-500">{cleaner.phone || 'No phone'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{cleaner.business_name}</div>
                      <div className="mt-1 text-xs text-gray-500">{cleaner.abn ? `ABN ${cleaner.abn}` : 'No ABN'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="line-clamp-3 max-w-[280px] text-gray-700">
                        {cleaner.notes || cleaner.preferred_work || 'No notes recorded'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      {cleaner.internal_owner || 'Unassigned'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${cleaner.working_with_children_check ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                          {cleaner.working_with_children_check ? 'WWCC checked' : 'WWCC missing'}
                        </span>
                        {complianceFlags.slice(0, 3).map((flag) => (
                          <span key={flag.label} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${flag.tone}`}>
                            {flag.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-gray-700">{[cleaner.suburb, cleaner.city, cleaner.state].filter(Boolean).join(', ') || 'No location'}</div>
                      <div className="mt-1 text-xs text-gray-500">{toCsv(cleaner.service_areas) || 'No areas set'}</div>
                    </td>
                  </tr>
                )
              })}
              {cleaners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    No cleaner records found. Create the first one to start the database.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[100] bg-gray-950/55 p-3 sm:p-6">
          <div className="mx-auto flex max-h-[94vh] max-w-[1500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>
                  {editingId ? [form.firstName, form.lastName].filter(Boolean).join(' ') || 'Cleaner Record' : 'Create Cleaner'}
                </h2>
                <p className="text-sm text-gray-600">{editingId ? form.businessName : 'Add a cleaner and save before uploading documents.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                >
                  Close
                </button>
                {modalTab === 'details' ? (
                  <button
                    type="submit"
                    form="cleaner-details-form"
                    disabled={isSaving}
                    className="rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: '#12b76a' }}
                  >
                    {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Cleaner'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="border-b border-gray-200 px-5 pt-3">
              <div className="flex gap-1 overflow-x-auto">
                {modalTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setModalTab(tab.value as CleanerModalTab)}
                    className={`rounded-t-lg border px-4 py-2 text-sm font-semibold ${
                      modalTab === tab.value
                        ? 'border-gray-200 border-b-white bg-white text-gray-900'
                        : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto p-5">
              {modalTab === 'details' ? (
                <form id="cleaner-details-form" onSubmit={saveCleaner} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Business name
                <input required value={form.businessName} onChange={(event) => setField('businessName', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                First name
                <input required value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Surname
                <input required value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Email
                <input required type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Mobile
                <input value={form.phone} onChange={(event) => setField('phone', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Alternate phone
                <input value={form.alternatePhone} onChange={(event) => setField('alternatePhone', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                ABN
                <input value={form.abn} onChange={(event) => setField('abn', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                Address
                <input value={form.address} onChange={(event) => setField('address', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <AdminLocalityAutocomplete
                city={form.city}
                state={form.state}
                suburb={form.suburb}
                postcode={form.postcode}
                onChange={(updates) => {
                  setForm((current) => ({
                    ...current,
                    city: updates.city ?? current.city,
                    state: updates.state ?? current.state,
                    suburb: updates.suburb,
                    postcode: updates.postcode,
                  }))
                }}
              />
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Suburb
                <input value={form.suburb} onChange={(event) => setField('suburb', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Postcode
                <input value={form.postcode} onChange={(event) => setField('postcode', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                City
                <input list="cleaner-city-options" value={form.city} onChange={(event) => setField('city', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                <datalist id="cleaner-city-options">
                  {citySuggestions.map((city) => <option key={city} value={city} />)}
                </datalist>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                State
                <select value={form.state} onChange={(event) => setField('state', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                  {australianStates.map((option) => <option key={option.value} value={option.value}>{option.value} - {option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Status
                <select value={form.status} onChange={(event) => setField('status', event.target.value as CleanerStatus)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Services
                <input value={form.services} onChange={(event) => setField('services', event.target.value)} placeholder="office, medical, after_hours" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Service areas
                <input value={form.serviceAreas} onChange={(event) => setField('serviceAreas', event.target.value)} placeholder="Richmond, Southbank, CBD" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                Preferred work
                <input value={form.preferredWork} onChange={(event) => setField('preferredWork', event.target.value)} placeholder="Medical, office, after-hours..." className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Compliance status
                <select value={form.complianceStatus} onChange={(event) => setField('complianceStatus', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                  {complianceOptions.map((option) => <option key={option} value={option}>{formatStatus(option)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Internal owner
                <input value={form.internalOwner} onChange={(event) => setField('internalOwner', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Insurance expiry
                <input type="date" value={form.insuranceExpiry} onChange={(event) => setField('insuranceExpiry', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Police check expiry
                <input type="date" value={form.policeCheckExpiry} onChange={(event) => setField('policeCheckExpiry', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Induction expiry
                <input type="date" value={form.inductionExpiry} onChange={(event) => setField('inductionExpiry', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Rating
                <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(event) => setField('rating', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.workingWithChildrenCheck}
                  onChange={(event) => setField('workingWithChildrenCheck', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block font-semibold text-gray-900">Working with Children&apos;s Check</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-600">
                    Tick when the cleaner has confirmed a current WWCC.{' '}
                    <a
                      href="https://www.vic.gov.au/working-with-children-check"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                    >
                      Victorian WWCC information
                    </a>
                  </span>
                </span>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                Internal notes
                <textarea rows={4} value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
              </label>
            </div>
          </form>
              ) : null}

              {modalTab === 'documents' ? (
                <section className="space-y-5">
                  <div id="cleaner-document-upload" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Compliance document upload</div>
                    <p className="mt-1 text-xs text-gray-600">
                      Add insurance, police check, induction, contract, or other compliance files.
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Private admin files
                  </span>
                </div>
                {selectedCleaner ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {documentDraft.replaceDocumentId ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:col-span-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span>
                            Replacing <span className="font-semibold">{documentDraft.replaceFileName}</span>. Choose the new file and upload to remove the old copy.
                          </span>
                          <button
                            type="button"
                            onClick={cancelDocumentReplacement}
                            className="w-fit text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
                          >
                            Cancel replacement
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Document type
                      <select
                        value={documentDraft.documentType}
                        onChange={(event) => setDocumentDraft({ ...documentDraft, documentType: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
                      >
                        {documentTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Expiry date
                      <input
                        type="date"
                        value={documentDraft.expiryDate}
                        onChange={(event) => setDocumentDraft({ ...documentDraft, expiryDate: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                      File
                      <input
                        key={`${documentDraft.replaceDocumentId ?? 'new'}-${documentDraft.file ? 'selected-file' : 'empty-file'}`}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(event) => setDocumentDraft({ ...documentDraft, file: event.target.files?.[0] ?? null })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                      Notes
                      <input
                        value={documentDraft.notes}
                        onChange={(event) => setDocumentDraft({ ...documentDraft, notes: event.target.value })}
                        placeholder="Certificate number, insurer, renewal note..."
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={() => void uploadDocument()}
                        disabled={isUploading || !documentDraft.file}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: '#22c55e' }}
                      >
                        {isUploading ? 'Uploading...' : documentDraft.replaceDocumentId ? 'Upload Replacement' : 'Upload Document'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    Save the cleaner record first, then upload documents against that saved profile.
                  </div>
                )}
              </div>

          {selectedCleaner ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Uploaded Documents</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Saved insurance, police check, induction, contract, or other compliance files.
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Private admin files
                  </div>
                </div>

                <div className="mt-6 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
                  {selectedDetail?.documents.map((document) => {
                    const expiryStatus = getDocumentExpiryStatus(document.expiry_date)
                    return (
                      <div key={document.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[150px_minmax(0,1fr)_120px_110px_140px]">
                        <div className="space-y-2">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(document.document_type)}`}>
                            {formatStatus(document.document_type)}
                          </span>
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${expiryStatus.tone}`}>
                            {expiryStatus.label}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <a
                            href={`/api/admin/cleaners/${selectedCleaner.id}/documents/${document.id}`}
                            className="font-semibold text-gray-900 underline-offset-2 hover:underline"
                          >
                            {document.file_name}
                          </a>
                          <div className="mt-1 text-xs text-gray-500">
                            {[formatBytes(document.size_bytes), document.notes].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="text-gray-600">
                          Expiry: {formatDate(document.expiry_date)}
                        </div>
                        <div className="text-gray-500">
                          Added: {formatDate(document.created_at)}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startReplacingDocument(document)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDocument(document)}
                            disabled={deletingDocumentId === document.id}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingDocumentId === document.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {selectedDetail?.documents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500">No documents uploaded yet.</div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
                </section>
              ) : null}

              {modalTab === 'comments' ? (
              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Comments</h2>
                <p className="mt-1 text-sm text-gray-600">Private staff notes attached to this cleaner.</p>
                {selectedCleaner ? (
                  <>
                    <textarea
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      rows={4}
                      placeholder="Add a note about availability, quality, compliance, or follow-up..."
                      className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void addComment()}
                      disabled={isSaving || !commentDraft.trim()}
                      className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: '#22c55e' }}
                    >
                      Add Comment
                    </button>
                    <div className="mt-5 space-y-4">
                      {selectedDetail?.comments.map((comment) => (
                        <div key={comment.id} className="border-l-4 border-green-500 pl-3">
                          <div className="text-xs font-semibold text-gray-500">{comment.author_name} · {formatDate(comment.created_at)}</div>
                          <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{comment.comment}</div>
                        </div>
                      ))}
                      {selectedDetail?.comments.length === 0 ? (
                        <div className="text-sm text-gray-500">No comments yet.</div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    Save the cleaner record before adding comments.
                  </div>
                )}
              </section>
              ) : null}

              {modalTab === 'email' ? (
              <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 p-6">
                  <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Email Cleaner</h2>
                  <p className="mt-1 text-sm text-gray-600">Choose a template, edit it, send, and log the result.</p>
                  {selectedCleaner ? (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Template
                      <select value={emailDraft.templateId} onChange={(event) => selectTemplate(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      To
                      <input value={`${getCleanerDisplayName(selectedCleaner)} <${selectedCleaner.email}>`} readOnly className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                      Subject
                      <input value={emailDraft.subject} onChange={(event) => setEmailDraft({ ...emailDraft, subject: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-2">
                      Message
                      <textarea rows={9} value={emailDraft.body} onChange={(event) => setEmailDraft({ ...emailDraft, body: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void sendEmail()}
                    disabled={isSending || !emailDraft.subject.trim() || !emailDraft.body.trim()}
                    className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    {isSending ? 'Sending…' : 'Send Email'}
                  </button>
                  </>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Save the cleaner record before sending email.
                    </div>
                  )}
                </div>

                {selectedCleaner ? (
                <div className="divide-y divide-gray-100">
                  {selectedDetail?.emails.map((email) => (
                    <div key={email.id} className="grid gap-3 px-6 py-4 text-sm md:grid-cols-[110px_minmax(0,1fr)_100px]">
                      <div className="text-gray-500">{formatDate(email.created_at)}</div>
                      <div>
                        <div className="font-semibold text-gray-900">{email.subject}</div>
                        <div className="mt-1 text-xs text-gray-500">{email.template_name || 'Custom email'} · {email.to_email}</div>
                        {email.error_message ? <div className="mt-1 text-xs text-red-600">{email.error_message}</div> : null}
                      </div>
                      <span className={`h-fit rounded-full px-2 py-1 text-center text-xs font-semibold ${statusTone(email.status)}`}>
                        {formatStatus(email.status)}
                      </span>
                    </div>
                  ))}
                  {selectedDetail?.emails.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-gray-500">No emails logged yet.</div>
                  ) : null}
                </div>
                ) : null}
              </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
