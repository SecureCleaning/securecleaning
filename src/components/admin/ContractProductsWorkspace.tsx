'use client'

import { useEmailQueueRunner } from '@/lib/useEmailQueueRunner'
import RichEmailEditor from '@/components/admin/RichEmailComposer'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import EmailMergeFieldPicker from '@/components/admin/EmailMergeFieldPicker'
import EmailPreviewModal from '@/components/admin/EmailPreviewModal'
import { getMissingCrmSignatureFields } from '@/lib/clientCrmPolicy'
import { CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS } from '@/lib/contractProductBroadcastTemplateTokens'
import { CONTRACT_PRODUCT_STATES } from '@/lib/contractProductPolicy'
import { getContractProductStartDateDraft, resolveContractProductStartDate } from '@/lib/contractProductListingDetails'
import type { ContractProduct } from '@/lib/contractProducts'
import { appendEmailMergeField } from '@/lib/emailMergeFields'
import { createRichEmailContent, hasRichEmailContent } from '@/lib/richEmailContent'
import type { RichEmailDocument } from '@/lib/richEmailContent'


function cleanerTaskDisplay(task: string | { label: string; cadence: string }) {
  return typeof task === 'string'
    ? { label: task, cadence: 'Every clean' }
    : { label: task.label, cadence: task.cadence.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase()) }
}

type WorkspaceData = {
  products: ContractProduct[]
  broadcasts: Array<{ id: string; state: string; subject: string; status: string; recipientMode: 'state' | 'single' | 'multiple'; senderName: string; senderEmail: string; recipientCount: number; sentCount: number; failedCount: number; skippedCount: number; createdAt: string }>
  templates: Array<{ id: string; name: string; subject: string; message: string; messageHtml: string; messageDocument: RichEmailDocument; updatedAt: string }>
  senders: BroadcastSender[]
  actor: { id: string; role: string; state: string | null; displayName: string }
  jobsUrl: string
}

type BroadcastCleaner = { id: string; name: string; businessName: string; email: string }
type BroadcastSender = { id: string; displayName: string; email: string; jobTitle: string; phone: string; role: string }
type BroadcastPreview = {
  defaultSubject: string
  defaultIntro: string
  defaultIntroHtml: string
  defaultIntroDocument: RichEmailDocument
  previewFingerprint: string
  recipientCount: number
  consideredCount: number
  excluded: Record<string, number>
  targetCleaner: BroadcastCleaner | null
  targetCleaners: BroadcastCleaner[]
  canSend: boolean
  emailPreview: {
    recipient: BroadcastCleaner
    fromName: string
    fromEmail: string
    replyTo: string
    subject: string
    html: string
    personalised: boolean
  }
}

type BroadcastHistoryPreview = { subject: string; from: string; to: string; html: string; status: string }

type ProductDraft = {
  heading: string
  description: string
  startDate: string
  startDateTbc: boolean
  annualVisits: string
  estimatedHoursPerVisit: string
  keyedJob: ContractProduct['keyedJob']
  formalContract: boolean
  freeInitialClean: boolean
  purchasePriceExGst: string
  pricingMethod: ContractProduct['pricingMethod']
  pricingNote: string
}

function draftFromProduct(product: ContractProduct): ProductDraft {
  return {
    heading: product.heading,
    description: product.description,
    ...getContractProductStartDateDraft(product.startDate),
    annualVisits: String(product.annualVisits),
    estimatedHoursPerVisit: product.estimatedHoursPerVisit,
    keyedJob: product.keyedJob,
    formalContract: product.formalContract,
    freeInitialClean: product.freeInitialClean,
    purchasePriceExGst: (product.purchasePriceExGstCents / 100).toFixed(2),
    pricingMethod: product.pricingMethod,
    pricingNote: product.pricingNote,
  }
}

function productUpdatePayload(draft: ProductDraft) {
  const { startDateTbc, ...fields } = draft
  return {
    ...fields,
    startDate: resolveContractProductStartDate(draft.startDate, startDateTbc),
  }
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(cents / 100)
}

function activityDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusClass(status: string) {
  if (status === 'available') return 'bg-green-100 text-green-800'
  if (status === 'sold') return 'bg-blue-100 text-blue-800'
  if (status === 'reserved') return 'bg-amber-100 text-amber-800'
  if (status === 'withdrawn') return 'bg-gray-200 text-gray-700'
  return 'bg-purple-100 text-purple-800'
}

export default function ContractProductsWorkspace({ portal = 'admin', initialProductId = '', assigneeId = '' }: { portal?: 'admin' | 'agent'; initialProductId?: string; assigneeId?: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedId, setSelectedId] = useState(initialProductId)
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [view, setView] = useState<'products' | 'broadcasts'>('products')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [broadcastState, setBroadcastState] = useState('VIC')
  const [broadcastProducts, setBroadcastProducts] = useState<string[]>([])
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastIntro, setBroadcastIntro] = useState('')
  const [broadcastIntroHtml, setBroadcastIntroHtml] = useState('')
  const [broadcastIntroDocument, setBroadcastIntroDocument] = useState<RichEmailDocument>(null)
  const [broadcastEditorKey, setBroadcastEditorKey] = useState('broadcast-editor-0')
  const [broadcastRecipientMode, setBroadcastRecipientMode] = useState<'state' | 'single' | 'multiple'>('state')
  const [broadcastCleanerId, setBroadcastCleanerId] = useState('')
  const [broadcastCleanerEmails, setBroadcastCleanerEmails] = useState('')
  const [broadcastSenderId, setBroadcastSenderId] = useState('')
  const [broadcastCleaners, setBroadcastCleaners] = useState<BroadcastCleaner[]>([])
  const [broadcastCleanersLoading, setBroadcastCleanersLoading] = useState(false)
  const [broadcastPreview, setBroadcastPreview] = useState<BroadcastPreview | null>(null)
  const [broadcastRequestId, setBroadcastRequestId] = useState('')
  const queue = useEmailQueueRunner()
  useEffect(() => { setBroadcastRequestId(sessionStorage.getItem('cleaner-broadcast-request') || '') }, [])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [broadcastHistoryPreview, setBroadcastHistoryPreview] = useState<BroadcastHistoryPreview | null>(null)

  const load = useCallback(async (preferredId = '') => {
    const response = await fetch('/api/admin/contract-products', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load contract products.')
    const next = result as WorkspaceData & { success: boolean }
    setData(next)
    setBroadcastSenderId((current) => next.senders.some((sender) => sender.id === current) ? current : next.actor.id)
    const id = next.products.some((product) => product.id === preferredId) ? preferredId : next.products[0]?.id ?? ''
    setSelectedId(id)
    const selected = next.products.find((product) => product.id === id)
    setDraft(selected ? draftFromProduct(selected) : null)
    const state = next.actor.state ?? next.products.find((product) => product.status === 'available')?.state ?? 'VIC'
    setBroadcastState(state)
  }, [])

  useEffect(() => { void load(initialProductId).catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load.')) }, [initialProductId, load])

  const loadBroadcastCleaners = useCallback(async (state: string) => {
    setBroadcastCleanersLoading(true)
    try {
      const response = await fetch('/api/admin/contract-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'broadcast.recipients', state }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load eligible cleaners.')
      setBroadcastCleaners(result.result.cleaners)
    } catch (error) {
      setBroadcastCleaners([])
      setMessage(error instanceof Error ? error.message : 'Unable to load eligible cleaners.')
    } finally {
      setBroadcastCleanersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!data || view !== 'broadcasts') return
    void loadBroadcastCleaners(broadcastState)
  }, [broadcastState, data, loadBroadcastCleaners, view])
  const selected = data?.products.find((product) => product.id === selectedId) ?? null
  const previewAnnualValue = selected && draft
    ? selected.clientPricePerVisitExGstCents * Math.max(0, Math.round(Number(draft.annualVisits) || 0)) : 0
  const previewPurchasePrice = draft?.pricingMethod === 'manual'
    ? Math.max(0, Math.round((Number(draft.purchasePriceExGst) || 0) * 100))
    : Math.round(previewAnnualValue * 0.5)
  const filtered = useMemo(() => (data?.products ?? []).filter((product) => filter === 'all' || product.status === filter), [data, filter])
  const stateProducts = (data?.products ?? []).filter((product) => product.state === broadcastState && product.status === 'available')
  const stateJobsUrl = data?.jobsUrl
    ? `${data.jobsUrl}${data.jobsUrl.includes('?') ? '&' : '?'}state=${encodeURIComponent(broadcastState)}`
    : ''
  const selectedBroadcastSender = data?.senders.find((sender) => sender.id === broadcastSenderId) ?? null
  const broadcastSenderMissing = selectedBroadcastSender ? getMissingCrmSignatureFields(selectedBroadcastSender) : ['sender']

  function invalidateBroadcastPreview() {
    setBroadcastPreview(null)
    setBroadcastRequestId('')
  }

  function selectProduct(id: string) {
    setSelectedId(id)
    const product = data?.products.find((item) => item.id === id)
    setDraft(product ? draftFromProduct(product) : null)
    setMessage('')
  }

  async function action(actionName: string, payload: Record<string, unknown>) {
    setBusy(actionName)
    setMessage('')
    try {
      const response = await fetch('/api/admin/contract-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, ...payload }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The action could not be completed.')
      return result.result
    } finally {
      setBusy('')
    }
  }

  async function save() {
    if (!selected || !draft) return
    try {
      await action('product.update', {
        productId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        ...productUpdatePayload(draft),
      })
      setMessage('Product saved.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save product.') }
  }

  async function publish() {
    if (!selected || !draft) return
    try {
      const saved = await action('product.update', {
        productId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        ...productUpdatePayload(draft),
      }) as ContractProduct
      await action('product.publish', { productId: selected.id, expectedUpdatedAt: saved.updatedAt })
      setMessage('Product published to the available-jobs directory.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to publish product.') }
  }

  async function withdraw() {
    if (!selected || !window.confirm('Remove this product from the available-jobs directory?')) return
    try {
      await action('product.withdraw', { productId: selected.id, expectedUpdatedAt: selected.updatedAt })
      setMessage('Product withdrawn.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to withdraw product.') }
  }

  async function refreshScope() {
    if (!selected || !window.confirm('Replace this cleaner scope with the latest saved winning-quote scope?')) return
    try {
      await action('product.refresh-scope', {
        productId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
      })
      await load(selected.id)
      setMessage('Cleaner scope refreshed from the winning quote.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to refresh the cleaner scope.') }
  }

  async function previewBroadcast() {
    try {
      const result = await action('broadcast.preview', {
        state: broadcastState,
        productIds: broadcastProducts,
        recipientMode: broadcastRecipientMode,
        cleanerId: broadcastCleanerId,
        cleanerEmails: broadcastCleanerEmails,
        subject: broadcastSubject,
        intro: broadcastIntro,
        introHtml: broadcastIntroHtml,
        introDocument: broadcastIntroDocument,
        senderStaffId: broadcastSenderId,
      })
      setBroadcastPreview(result)
      setBroadcastSubject(result.defaultSubject)
      setBroadcastIntro(result.defaultIntro)
      setBroadcastIntroHtml(result.defaultIntroHtml)
      setBroadcastIntroDocument(result.defaultIntroDocument)
      if (!broadcastIntroHtml && result.defaultIntroHtml) {
        setBroadcastEditorKey(`broadcast-editor-${crypto.randomUUID()}`)
      }
      setBroadcastRequestId('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview broadcast.') }
  }

  async function continueBroadcast(requestId: string) {
    try {
      await queue.run(async () => {
        const response = await fetch('/api/admin/contract-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'broadcast.continue', idempotencyKey: requestId }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Sending paused. Resume unsent recipients when ready.')
        return data.result as { inProgress?: boolean; paused?: boolean; sentCount: number; failedCount: number; remainingCount?: number }
      }, result => {
        setMessage(result.paused ? 'Resend account quota reached. Resume after upgrading your plan or the quota resets.' : `${result.sentCount} sent, ${result.failedCount} unresolved or failed, ${result.remainingCount ?? 0} queued. ${result.inProgress ? 'Keep this page open while sending.' : 'Broadcast complete.'}`)
        if (!result.inProgress) {
          sessionStorage.removeItem('cleaner-broadcast-request')
          setBroadcastRequestId(''); setBroadcastPreview(null)
          void load(selectedId)
        }
      })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sending paused. Resume unsent recipients.') }
  }

  async function sendBroadcast() {
    if (broadcastRequestId || queue.running || !broadcastPreview || !window.confirm(`Send this broadcast to ${broadcastPreview.recipientCount} eligible cleaners?`)) return
    const requestId = crypto.randomUUID()
    sessionStorage.setItem('cleaner-broadcast-request', requestId)
    setBroadcastRequestId(requestId)
    try {
      const result = await action('broadcast.send', {
        state: broadcastState, productIds: broadcastProducts, subject: broadcastSubject, intro: broadcastIntro,
        introHtml: broadcastIntroHtml, introDocument: broadcastIntroDocument,
        recipientMode: broadcastRecipientMode, cleanerId: broadcastCleanerId, cleanerEmails: broadcastCleanerEmails,
        senderStaffId: broadcastSenderId, idempotencyKey: requestId, previewFingerprint: broadcastPreview.previewFingerprint,
      })
      if (result.paused) { setMessage('Resend account quota reached. Resume after the plan upgrade or quota reset.'); return }
      await continueBroadcast(requestId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send broadcast. Check history before starting another send.') }
  }

  function loadTemplate() {
    if (broadcastRequestId) return
    const template = data?.templates.find((candidate) => candidate.id === selectedTemplateId)
    if (!template) return
    setBroadcastSubject(template.subject)
    setBroadcastIntro(template.message)
    setBroadcastIntroHtml(template.messageHtml)
    setBroadcastIntroDocument(template.messageDocument)
    setBroadcastEditorKey(`broadcast-editor-${crypto.randomUUID()}`)
    setTemplateName(template.name)
    invalidateBroadcastPreview()
    setMessage(`Template "${template.name}" loaded. You can edit it for this send.`)
  }

  function startNewTemplate() {
    setSelectedTemplateId('')
    setTemplateName('')
    setMessage('Enter a template name, then save the current subject and message as a new template.')
  }

  async function saveTemplate() {
    try {
      const template = await action('broadcast.template.save', {
        templateId: selectedTemplateId,
        name: templateName,
        subject: broadcastSubject,
        message: broadcastIntro,
        messageHtml: broadcastIntroHtml,
        messageDocument: broadcastIntroDocument,
      }) as WorkspaceData['templates'][number]
      setData((current) => current ? {
        ...current,
        templates: [...current.templates.filter((candidate) => candidate.id !== template.id), template]
          .sort((left, right) => left.name.localeCompare(right.name)),
      } : current)
      setSelectedTemplateId(template.id)
      setTemplateName(template.name)
      setMessage(`Template "${template.name}" saved.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save template.') }
  }

  async function archiveTemplate() {
    const template = data?.templates.find((candidate) => candidate.id === selectedTemplateId)
    if (!template || !window.confirm(`Archive the template "${template.name}"?`)) return
    try {
      await action('broadcast.template.archive', { templateId: template.id })
      setData((current) => current ? { ...current, templates: current.templates.filter((candidate) => candidate.id !== template.id) } : current)
      setSelectedTemplateId('')
      setTemplateName('')
      setMessage(`Template "${template.name}" archived.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to archive template.') }
  }

  async function previewBroadcastHistory(campaignId: string) {
    try {
      const preview = await action('broadcast.history.preview', { campaignId }) as BroadcastHistoryPreview
      setBroadcastHistoryPreview(preview)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open the saved email.')
    }
  }

  if (!data) return <div className="rounded-xl border border-gray-200 bg-white p-6">{message || 'Loading contract products...'}</div>
  const backHref = portal === 'agent' ? '/agent' : '/admin'

  return <div>
    <AdminPageHeader title="Contract Products" description="Turn won client opportunities into editable cleaner-facing contract listings." backHref={backHref} backLabel={portal === 'agent' ? 'Back to agent portal' : 'Back to overview'} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4">
      <div className="flex gap-2"><button type="button" onClick={() => setView('products')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'products' ? 'bg-teal-700 text-white' : 'bg-white text-gray-700'}`}>Products</button><button type="button" onClick={() => setView('broadcasts')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'broadcasts' ? 'bg-teal-700 text-white' : 'bg-white text-gray-700'}`}>Broadcasts</button></div>
      <div className="flex flex-wrap gap-2">{data.jobsUrl ? <><a href={view === 'broadcasts' ? stateJobsUrl : data.jobsUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800">Preview available jobs</a><button type="button" onClick={() => void navigator.clipboard.writeText(view === 'broadcasts' ? stateJobsUrl : data.jobsUrl)} className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800">Copy reusable link</button></> : <span className="text-sm text-amber-800">Reusable jobs link is not configured.</span>}</div>
    </div>
    {message ? <p role="status" className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">{message}</p> : null}

    {view === 'products' ? <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">{['all', 'draft', 'available', 'reserved', 'sold', 'withdrawn'].map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>{status}</button>)}</div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">{filtered.map((product) => <button key={product.id} type="button" onClick={() => selectProduct(product.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === product.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}><span className="block font-semibold">{product.productCode} · {product.clientDisplayName || 'Client not provided'}</span><span className="mt-1 block text-sm text-gray-600">{product.heading}</span><span className="mt-2 flex items-center justify-between text-xs"><span className={`rounded-full px-2 py-1 font-semibold ${statusClass(product.status)}`}>{product.status}</span><span>{money(Math.round(product.purchasePriceExGstCents * 1.1))} inc GST</span></span></button>)}{filtered.length === 0 ? <p className="p-3 text-sm text-gray-500">No products in this status.</p> : null}</div>
      </aside>
      {selected && draft ? <main className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-sm font-semibold text-teal-700">{selected.productCode}</p><h2 className="mt-1 text-xl font-bold text-gray-900">{selected.heading}</h2><p className="mt-1 text-sm text-gray-600">{selected.suburb}, {selected.state} · {selected.status} · {selected.interestCount} interest submission{selected.interestCount === 1 ? '' : 's'}</p>{selected.interestCount > 0 ? <a href={`#product-activity-${selected.id}`} className="mt-2 inline-flex text-sm font-semibold text-teal-700 underline">View interest activity</a> : null}</div><div className="flex flex-wrap items-start justify-end gap-2"><Link href={portal === 'agent' ? `/availability/clients/${encodeURIComponent(assigneeId)}?opportunity=${selected.opportunityId}` : `/admin/clients?opportunity=${selected.opportunityId}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Client record</Link>{selected.sourceQuoteRef ? <Link href={portal === 'agent' ? `/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(selected.sourceQuoteRef)}?opportunity=${encodeURIComponent(selected.opportunityId)}` : `/admin/quotes/${encodeURIComponent(selected.sourceQuoteRef)}?opportunity=${encodeURIComponent(selected.opportunityId)}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Winning quote</Link> : null}<Link href={portal === 'agent' ? `/availability/sales/${encodeURIComponent(assigneeId)}?product=${encodeURIComponent(selected.id)}` : `/admin/sales?product=${encodeURIComponent(selected.id)}`} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Product sale</Link><div className="min-w-44 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-right"><span className="block text-[11px] font-bold uppercase tracking-wide text-teal-700">Private client</span><strong className="block text-sm text-gray-900">{selected.clientDisplayName || 'Not provided'}</strong></div></div></div></section>
        <section id={`product-activity-${selected.id}`} className="scroll-mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Product activity</h3><p className="mt-1 text-sm text-gray-600">Private history of interest registered for this product. These details are not included in public listings or broadcasts.</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">{selected.activity.length} submission{selected.activity.length === 1 ? '' : 's'}</span></div>{selected.activity.length > 0 ? <div className="mt-4 space-y-3">{selected.activity.map((item) => <details key={item.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-gray-900">Interest registered · {item.contactName || item.email}</strong><p className="mt-1 text-sm text-gray-600">{activityDate(item.occurredAt)} · {item.matchStatus === 'approved_cleaner' ? 'Approved cleaner matched' : 'Unregistered email'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.notificationStatus === 'sent' ? 'bg-green-100 text-green-800' : item.notificationStatus === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>Agent email {item.notificationStatus}</span></div></summary><dl className="mt-4 grid gap-3 border-t border-gray-200 pt-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-gray-500">Email</dt><dd><a href={`mailto:${item.email}`} className="text-teal-700 underline">{item.email}</a></dd></div><div><dt className="font-semibold text-gray-500">Phone</dt><dd>{item.phone ? <a href={`tel:${item.phone}`} className="text-teal-700 underline">{item.phone}</a> : 'Not provided'}</dd></div><div><dt className="font-semibold text-gray-500">Interest status</dt><dd className="capitalize">{item.interestStatus.replaceAll('_', ' ')}</dd></div><div><dt className="font-semibold text-gray-500">Profile match</dt><dd>{item.matchStatus === 'approved_cleaner' ? 'Approved cleaner profile' : 'No approved profile matched'}</dd></div><div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Submitted note</dt><dd className="mt-1 whitespace-pre-wrap">{item.note || 'No note supplied.'}</dd></div></dl></details>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">No interest has been registered for this product yet.</p>}</section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Listing details</h3><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium md:col-span-2">Heading<input value={draft.heading} onChange={(event) => setDraft({ ...draft, heading: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium md:col-span-2">Cleaner-facing description<textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><div><div className="flex items-center justify-between gap-3 text-sm"><label htmlFor="product-start-date" className="font-medium">Proposed start date</label><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={draft.startDateTbc} onChange={(event) => setDraft({ ...draft, startDateTbc: event.target.checked })} /> TBC</label></div><input id="product-start-date" type="date" value={draft.startDateTbc ? '' : draft.startDate} disabled={draft.startDateTbc} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100" /><span className="mt-1 block text-xs text-gray-500">{draft.startDateTbc ? 'The cleaner listing will show TBC.' : 'Tick TBC if the commencement date is not confirmed.'}</span></div><label className="text-sm font-medium">Estimated hours per visit<input type="text" inputMode="decimal" maxLength={40} value={draft.estimatedHoursPerVisit} onChange={(event) => setDraft({ ...draft, estimatedHoursPerVisit: event.target.value })} placeholder="e.g. 1.5 - 2 hours" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /><span className="mt-1 block text-xs font-normal text-gray-500">Enter one duration or a range. Leave blank to show TBC.</span></label><label className="text-sm font-medium">Keyed job<select value={draft.keyedJob} onChange={(event) => setDraft({ ...draft, keyedJob: event.target.value as ProductDraft['keyedJob'] })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="unknown">To confirm</option><option value="keyed">Keyed</option><option value="not_keyed">Not keyed</option></select></label><div className="flex flex-col justify-end gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.formalContract} onChange={(event) => setDraft({ ...draft, formalContract: event.target.checked })} /> Formal contract</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.freeInitialClean} onChange={(event) => setDraft({ ...draft, freeInitialClean: event.target.checked })} /> Free initial clean</label></div></div></section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Service and financial details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs font-semibold uppercase text-gray-500">Client rate / visit</p><p className="mt-1 font-semibold">{money(selected.clientPricePerVisitExGstCents)} ex GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Annual value preview</p><p className="mt-1 font-semibold">{money(previewAnnualValue)} ex GST</p><p className="text-xs text-gray-500">{money(Math.round(previewAnnualValue * 1.1))} inc GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Purchase price preview</p><p className="mt-1 font-semibold">{money(previewPurchasePrice)} ex GST</p><p className="text-xs text-gray-500">{money(Math.round(previewPurchasePrice * 1.1))} inc GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Schedule</p><p className="mt-1 font-semibold">{selected.frequency.replaceAll('_', ' ')} · {selected.timePreference.replaceAll('_', ' ')}</p></div><label className="text-sm font-medium">Annual visits<input type="number" min="1" max="366" value={draft.annualVisits} onChange={(event) => setDraft({ ...draft, annualVisits: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Purchase pricing<select value={draft.pricingMethod} onChange={(event) => setDraft({ ...draft, pricingMethod: event.target.value as ProductDraft['pricingMethod'] })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="default_50_percent">Default 50%</option><option value="manual">Manual override</option></select></label><label className="text-sm font-medium">Purchase price ex GST<input type="number" min="1" step="0.01" value={draft.purchasePriceExGst} disabled={draft.pricingMethod !== 'manual'} onChange={(event) => setDraft({ ...draft, purchasePriceExGst: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100" /><span className="mt-1 block text-xs font-normal text-gray-500">The preview above is the amount that will be published.</span></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Internal pricing note<textarea rows={2} value={draft.pricingNote} onChange={(event) => setDraft({ ...draft, pricingNote: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div></section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Cleaner scope preview</h3><p className="mt-1 text-sm text-gray-600">This independent snapshot excludes the client identity, exact address, postcode, quote reference, pricing calculations, and security notes.</p></div>{selected.status === 'draft' || selected.status === 'withdrawn' ? <button type="button" onClick={() => void refreshScope()} disabled={Boolean(busy)} className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-700 disabled:opacity-60">{busy === 'product.refresh-scope' ? 'Refreshing...' : 'Refresh from winning quote'}</button> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.cleanerScopeSnapshot.rooms.map((room, index) => <div key={`${room.type}-${index}`} className="rounded-xl border border-gray-200 p-4"><h4 className="font-semibold">{room.label} · Qty {room.quantity}</h4><p className="mt-1 text-xs text-gray-500">{room.size > 0 ? `${room.size} sqm each · ` : ''}Floor {room.floor}</p>{room.description ? <p className="mt-2 text-sm text-gray-600">{room.description}</p> : null}<ul className="mt-2 space-y-1 text-sm text-gray-600">{room.tasks.map((task, taskIndex) => { const display = cleanerTaskDisplay(task); return <li key={`${display.label}-${taskIndex}`} className="flex justify-between gap-3"><span>{display.label}</span><strong className="shrink-0 text-xs">{display.cadence}</strong></li> })}</ul>{(room.selectedOptions ?? []).length > 0 ? <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600"><strong className="uppercase text-gray-500">Selected for this area</strong><ul className="mt-1 list-disc pl-4">{room.selectedOptions?.map((option) => <li key={option}>{option}</li>)}</ul></div> : null}</div>)}</div></section>
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg">{selected.status === 'available' ? <><span className="mr-auto text-sm text-gray-600">Withdraw this listing before editing or publishing a new version.</span><button type="button" onClick={() => void withdraw()} disabled={Boolean(busy)} className="rounded-lg border border-red-200 px-5 py-3 font-semibold text-red-700">Withdraw</button></> : selected.status === 'draft' || selected.status === 'withdrawn' ? <><button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'product.update' ? 'Saving...' : 'Save draft'}</button><button type="button" onClick={() => void publish()} disabled={Boolean(busy)} className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">Publish</button></> : <span className="text-sm text-gray-600">This product is locked while {selected.status}.</span>}</div>
      </main> : <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">Close a CRM opportunity as won to create the first product.</div>}
    </div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">Email available jobs</h2>
        <p className="mt-1 text-sm text-gray-600">Send to one cleaner, a selected group, or every eligible cleaner in a state. Every email includes the selected products and the state-filtered available-jobs link.</p>

        {broadcastRequestId ? <div role="status" className="my-3 rounded-lg bg-blue-50 p-3 text-sm"><p>Send request saved. Keep this page open; after an interruption resume only unsent recipients.</p><button type="button" disabled={queue.running || Boolean(busy)} onClick={() => void continueBroadcast(broadcastRequestId)} className="mt-2 rounded border px-3 py-2">{queue.running ? 'Sending...' : 'Resume / check this broadcast'}</button><button type="button" disabled={queue.running || Boolean(busy)} onClick={() => { if (window.confirm('Start a separate broadcast? Check history first. This does not cancel the previous request and could send duplicate emails.')) { sessionStorage.removeItem('cleaner-broadcast-request'); setBroadcastRequestId(''); setBroadcastPreview(null) } }} className="ml-3">Start a new broadcast</button></div> : null}
        <fieldset disabled={Boolean(broadcastRequestId)}>
        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h3 className="font-semibold text-gray-900">1. Choose recipients</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">State or territory
              <select value={broadcastState} disabled={data.actor.role === 'agent'} onChange={(event) => {
                setBroadcastState(event.target.value)
                setBroadcastProducts([])
                setBroadcastCleanerId('')
                setBroadcastCleanerEmails('')
                invalidateBroadcastPreview()
              }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                {CONTRACT_PRODUCT_STATES.map((state) => <option key={state}>{state}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Send to</legend>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="broadcast-recipient-mode" checked={broadcastRecipientMode === 'state'} onChange={() => { setBroadcastRecipientMode('state'); setBroadcastCleanerId(''); setBroadcastCleanerEmails(''); invalidateBroadcastPreview() }} /> All eligible cleaners in {broadcastState}</label>
                <label className="flex items-center gap-2"><input type="radio" name="broadcast-recipient-mode" checked={broadcastRecipientMode === 'single'} onChange={() => { setBroadcastRecipientMode('single'); invalidateBroadcastPreview() }} /> One cleaner</label>
                <label className="flex items-center gap-2"><input type="radio" name="broadcast-recipient-mode" checked={broadcastRecipientMode === 'multiple'} onChange={() => { setBroadcastRecipientMode('multiple'); setBroadcastCleanerId(''); invalidateBroadcastPreview() }} /> Selected cleaners</label>
              </div>
            </fieldset>
            {broadcastRecipientMode === 'single' ? <label className="text-sm font-medium sm:col-span-2">Cleaner
              <select value={broadcastCleanerId} disabled={broadcastCleanersLoading} onChange={(event) => { setBroadcastCleanerId(event.target.value); invalidateBroadcastPreview() }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <option value="">{broadcastCleanersLoading ? 'Loading eligible cleaners...' : 'Select an approved cleaner'}</option>
                {broadcastCleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id}>{cleaner.businessName || cleaner.name} · {cleaner.name} · {cleaner.email}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-gray-500">Only approved, non-suppressed cleaners in {broadcastState} are available.</span>
            </label> : broadcastRecipientMode === 'multiple' ? <label className="text-sm font-medium sm:col-span-2">Cleaner email addresses
              <textarea rows={3} maxLength={300000} value={broadcastCleanerEmails} onChange={(event) => { setBroadcastCleanerEmails(event.target.value); invalidateBroadcastPreview() }} placeholder="cleaner.one@example.com.au, cleaner.two@example.com.au" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5" />
              <span className="mt-1 block text-xs font-normal text-gray-500">Enter two or more addresses separated by commas, semicolons, or new lines. Every address must match an approved, eligible cleaner in {broadcastState}; no email is sent until the list passes the check below.</span>
              {!broadcastCleanersLoading && broadcastCleaners.length > 0 ? <span className="mt-2 block text-xs font-normal text-gray-500">Eligible addresses: {broadcastCleaners.map((cleaner) => cleaner.email).join(', ')}</span> : null}
            </label> : <p className="text-sm text-gray-600 sm:col-span-2">{broadcastCleanersLoading ? 'Checking cleaner eligibility...' : `${broadcastCleaners.length} cleaners are currently eligible in ${broadcastState}. Final eligibility is checked again before sending.`}</p>}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900">2. Choose available products</h3>
          <p className="mt-1 text-xs text-gray-500">Leave every box unticked to include all available products in {broadcastState}, or select particular jobs.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stateProducts.map((product) => <label key={product.id} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm">
              <input type="checkbox" checked={broadcastProducts.includes(product.id)} onChange={(event) => {
                setBroadcastProducts(event.target.checked ? [...broadcastProducts, product.id] : broadcastProducts.filter((id) => id !== product.id))
                invalidateBroadcastPreview()
              }} />
              <span><strong>{product.productCode}</strong> · {product.suburb}<span className="block text-xs text-gray-500">{product.heading}</span></span>
            </label>)}
            {stateProducts.length === 0 ? <p className="text-sm text-gray-500">No available products in this state.</p> : null}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900">3. Write the email</h3>
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="text-sm font-medium">Send as
              {data.actor.role === 'owner' ? <select value={broadcastSenderId} onChange={(event) => { setBroadcastSenderId(event.target.value); invalidateBroadcastPreview() }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                {data.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} · {sender.jobTitle} · {sender.email}</option>)}
              </select> : <span className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-normal">{selectedBroadcastSender?.displayName ?? data.actor.displayName}</span>}
            </label>
            {selectedBroadcastSender ? <p className="mt-2 whitespace-pre-line text-xs text-gray-600">{`Email signature:\n${selectedBroadcastSender.displayName}\n${selectedBroadcastSender.jobTitle}\nSecure Cleaning\n${selectedBroadcastSender.phone}\n${selectedBroadcastSender.email}`}</p> : null}
            <p className="mt-2 text-xs text-gray-500">The selected name appears in the From heading and signature. Replies go to this person&apos;s work email. Unless the owner changes this selection, it defaults to whoever is signed in.</p>
            {broadcastSenderMissing.length > 0 ? <p className="mt-2 text-xs font-semibold text-amber-800">Complete this sender&apos;s Team Access details before sending: {broadcastSenderMissing.join(', ')}.</p> : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="text-sm font-medium">Email template
              <select value={selectedTemplateId} onChange={(event) => { setSelectedTemplateId(event.target.value); setTemplateName(data.templates.find((template) => template.id === event.target.value)?.name ?? '') }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <option value="">Custom email</option>
                {data.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={loadTemplate} disabled={!selectedTemplateId || Boolean(busy)} className="self-end rounded-lg border border-teal-300 px-4 py-2.5 text-sm font-semibold text-teal-800 disabled:opacity-50">Load template</button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Loading a template copies it into this email. Agents can change the copied subject and message without altering the saved template.</p>
          <div className="mt-4 grid gap-4">
            <label className="text-sm font-medium">Subject
              <input maxLength={240} value={broadcastSubject} onChange={(event) => { setBroadcastSubject(event.target.value); invalidateBroadcastPreview() }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
              <span className="mt-2 block"><EmailMergeFieldPicker fields={CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS} onInsert={(token) => { setBroadcastSubject((current) => appendEmailMergeField(current, token)); invalidateBroadcastPreview() }} /></span>
            </label>
            <div>
              <RichEmailEditor
                disabled={Boolean(broadcastRequestId)} resetKey={broadcastEditorKey}
                value={createRichEmailContent({ document: broadcastIntroDocument, html: broadcastIntroHtml, text: broadcastIntro })}
                onChange={(content) => {
                  setBroadcastIntro(content.text)
                  setBroadcastIntroHtml(content.html)
                  setBroadcastIntroDocument(content.document)
                  invalidateBroadcastPreview()
                }}
                label="Message"
                placeholder="Write the email introduction…"
                minHeight={220}
                mergeFields={CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS}
              />
              <span className="mt-1 block text-xs text-gray-500">The greeting, product cards, available-jobs button, your signature, and unsubscribe link are protected and added automatically.</span>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-sm font-semibold text-blue-950">Automatic template fields</p>
            <p className="mt-1 text-xs text-blue-900">Choose a field from either Database fields menu. The preview replaces it with the selected cleaner, broadcast, or sender data before anything can be sent. Older double-brace templates remain supported.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(['Cleaner database', 'Broadcast selection', 'Team Access'] as const).map((source) => <div key={source}>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-900">{source}</p>
                <ul className="mt-1 space-y-1 text-xs text-blue-950">
                  {CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS.filter((field) => field.source === source).map((field) => <li key={field.token}><code className="rounded bg-white px-1 py-0.5 font-semibold">{field.token}</code> <span className="text-blue-800">- {field.description}</span></li>)}
                </ul>
              </div>)}
            </div>
          </div>
          {stateJobsUrl ? <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm">
            <strong>Automatic jobs link for {broadcastState}</strong>
            <p className="mt-1 break-all text-xs text-gray-600">{stateJobsUrl}</p>
            <div className="mt-2 flex gap-2"><a href={stateJobsUrl} target="_blank" rel="noreferrer" className="rounded-md border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800">Open link</a><button type="button" onClick={() => void navigator.clipboard.writeText(stateJobsUrl)} className="rounded-md border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800">Copy link</button></div>
          </div> : <p className="mt-4 text-sm text-amber-800">The reusable available-jobs link must be configured before sending.</p>}
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900">4. Preview before sending</h3>
          <p className="mt-1 text-xs text-gray-500">This builds the personalised subject and complete email using the same server-side template used for the real send. Changing a recipient, product, sender, subject, or message removes the preview and disables Send until you preview again.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={() => void previewBroadcast()} disabled={Boolean(busy) || stateProducts.length === 0 || broadcastSenderMissing.length > 0 || (broadcastRecipientMode === 'single' && !broadcastCleanerId) || (broadcastRecipientMode === 'multiple' && !broadcastCleanerEmails.trim())} className="rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'broadcast.preview' ? 'Building preview...' : 'Preview email & confirm recipients'}</button>
          </div>
          {broadcastPreview ? <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm">
              <strong>{broadcastPreview.recipientCount} eligible recipient{broadcastPreview.recipientCount === 1 ? '' : 's'} confirmed</strong>
              {broadcastPreview.targetCleaners.length > 0 ? <ul className="mt-2 space-y-1 text-gray-700">{broadcastPreview.targetCleaners.map((cleaner) => <li key={cleaner.id}>{cleaner.businessName || cleaner.name} · {cleaner.email}</li>)}</ul> : <p className="mt-1 text-gray-700">All eligible cleaners in {broadcastState}; {broadcastPreview.consideredCount} approved records checked.</p>}
              <p className="mt-1 text-gray-600">Excluded: {broadcastPreview.excluded.suppressed ?? 0} suppressed, {broadcastPreview.excluded.invalidEmail ?? 0} invalid email, {broadcastPreview.excluded.duplicateEmail ?? 0} duplicate email.</p>
              {!broadcastPreview.canSend ? <p className="mt-2 font-semibold text-amber-800">No eligible recipients are selected.</p> : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-300 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 p-4 text-sm">
                <p><span className="font-semibold text-gray-600">Preview recipient:</span> {broadcastPreview.emailPreview.recipient.name} · {broadcastPreview.emailPreview.recipient.email}</p>
                <p className="mt-1"><span className="font-semibold text-gray-600">From:</span> {broadcastPreview.emailPreview.fromName} &lt;{broadcastPreview.emailPreview.fromEmail}&gt;</p>
                <p className="mt-1"><span className="font-semibold text-gray-600">Reply-to:</span> {broadcastPreview.emailPreview.replyTo}</p>
                <p className="mt-1"><span className="font-semibold text-gray-600">Subject:</span> {broadcastPreview.emailPreview.subject}</p>
                {broadcastPreview.emailPreview.personalised ? <p className="mt-2 text-xs text-teal-800">This is a sample using the first confirmed recipient. Cleaner fields are filled separately for every recipient when sent.</p> : null}
              </div>
              <iframe title="Product broadcast email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={broadcastPreview.emailPreview.html} className="h-[720px] w-full bg-white" />
            </div>
            <button type="button" onClick={() => void sendBroadcast()} disabled={Boolean(busy) || queue.running || Boolean(broadcastRequestId) || !broadcastPreview.canSend || broadcastPreview.recipientCount === 0 || broadcastSenderMissing.length > 0} className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'broadcast.send' ? 'Sending...' : `Send this preview to ${broadcastPreview.recipientCount} cleaner${broadcastPreview.recipientCount === 1 ? '' : 's'}`}</button>
          </div> : null}
        </div>
        </fieldset>
      </section>

      <aside className="space-y-5">
        {data.actor.role === 'owner' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Template library</h2><p className="mt-1 text-xs text-gray-500">Owner controls</p></div><button type="button" onClick={startNewTemplate} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">New</button></div>
          <p className="mt-3 text-sm text-gray-600">Save the current subject, message, and any automatic fields as a reusable starting point for agents. The field guide beside the message shows which Cleaner database, broadcast, and Team Access details can be filled.</p>
          <label className="mt-4 block text-sm font-medium">Template name
            <input maxLength={80} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. New NSW contracts" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveTemplate()} disabled={Boolean(busy) || !templateName || !broadcastSubject || !hasRichEmailContent({ html: broadcastIntroHtml, text: broadcastIntro })} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{selectedTemplateId ? 'Update template' : 'Save new template'}</button>
            {selectedTemplateId ? <button type="button" onClick={() => void archiveTemplate()} disabled={Boolean(busy)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Archive</button> : null}
          </div>
          <p className="mt-3 text-xs text-gray-500">Updating a template does not change emails already sent or the agent&apos;s current draft unless they load it again.</p>
        </section> : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Email history</h2>
          <div className="mt-3 divide-y divide-gray-100">{data.broadcasts.map((campaign) => <div key={campaign.id} className="py-3 text-sm">
            <div className="flex justify-between gap-3"><strong>{campaign.state} · {campaign.subject}</strong><span className="text-xs uppercase text-gray-500">{campaign.status}</span></div>
            <p className="mt-1 text-xs text-gray-500">{campaign.recipientMode === 'single' ? 'Single cleaner' : campaign.recipientMode === 'multiple' ? 'Selected cleaners' : 'State broadcast'} · {new Date(campaign.createdAt).toLocaleString('en-AU')}</p>
            <p className="mt-1 text-xs text-gray-500">Sent as {campaign.senderName || 'Secure Cleaning'}{campaign.senderEmail ? ` · ${campaign.senderEmail}` : ''}</p>
            <p className="mt-1 text-xs text-gray-500">{campaign.sentCount}/{campaign.recipientCount} sent · {campaign.failedCount} unresolved/failed</p>
            <button type="button" onClick={() => void previewBroadcastHistory(campaign.id)} disabled={Boolean(busy)} className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50">View sent email</button>
          </div>)}{data.broadcasts.length === 0 ? <p className="py-3 text-sm text-gray-500">No emails sent yet.</p> : null}</div>
        </section>
      </aside>
    </div>}
    <EmailPreviewModal
      open={Boolean(broadcastHistoryPreview)}
      title="Sent broadcast email"
      subject={broadcastHistoryPreview?.subject ?? ''}
      from={broadcastHistoryPreview?.from}
      to={broadcastHistoryPreview?.to}
      html={broadcastHistoryPreview?.html ?? ''}
      onClose={() => setBroadcastHistoryPreview(null)}
    />
  </div>
}
