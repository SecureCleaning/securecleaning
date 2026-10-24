'use client'

import ContractNotes from '@/components/admin/ContractNotes'

import SalePriceAmendment from '@/components/admin/SalePriceAmendment'
import PaymentPlanEditor from '@/components/admin/PaymentPlanEditor'
import RichEmailEditor from '@/components/admin/RichEmailComposer'
import EmailMergeFieldPicker from '@/components/admin/EmailMergeFieldPicker'
import ContractSaleInspectionPanel from '@/components/admin/ContractSaleInspectionPanel'
import ActionToast, { type ActionToastTone } from '@/components/ActionToast'
import { createRichEmailContent } from '@/lib/richEmailContent'
import { appendEmailMergeField, CLEANER_PROFILE_UPDATE_EMAIL_MERGE_FIELDS, INDUSTRY_MERGE_FIELD } from '@/lib/emailMergeFields'
import { HANDOVER_EMAIL_MERGE_FIELDS, type ContractSaleHandoverEmailTemplate } from '@/lib/contractSaleHandoverTemplates'

import Link from 'next/link'
import ContractSaleFollowup from '@/components/admin/ContractSaleFollowup'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveInvoiceSelection } from '@/lib/invoiceDirectoryPolicy'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import type { ContractProduct } from '@/lib/contractProducts'
import type { ContractSale, ContractSaleCleanerOption, ContractSaleCleanerProfileTemplate, ContractSaleInspectionTemplate, ContractSaleInvoiceTemplate } from '@/lib/contractSales'
import type { ClientServiceAgreementDetails, ClientServiceAgreementRequirement } from '@/lib/clientServiceAgreementPolicy'

type Data = {
  products: ContractProduct[]
  sales: ContractSale[]
  cleaners: ContractSaleCleanerOption[]
  invoiceTemplate: ContractSaleInvoiceTemplate
  inspectionTemplate: ContractSaleInspectionTemplate
  cleanerProfileTemplate: ContractSaleCleanerProfileTemplate
  handoverTemplates: Record<'client' | 'cleaner', ContractSaleHandoverEmailTemplate>
  actor: { id: string; role: string; state: string | null; displayName: string }
}

type InvoiceEmailPreview = {
  id: string
  invoiceId: string
  deliveryKind: string
  recipientEmail: string
  replyToEmail: string
  subject: string
  html: string
  attachmentNames: string[]
  senderName: string
  senderEmail: string
  deliveryStatus: string
  providerMessageId: string | null
  deliveryError: string | null
  sentAt: string | null
  createdAt: string
}

type SaleTab = 'overview' | 'agreement' | 'clientAgreement' | 'invoices' | 'inspection' | 'followup' | 'activity'
type FeedbackTone = ActionToastTone

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const emptyRequirement = (details = ''): ClientServiceAgreementRequirement => ({ notApplicable: !details, details })

function clientAgreementDefaults(sale: ContractSale, product: ContractProduct): ClientServiceAgreementDetails {
  const frequency = product.frequency.replaceAll('_', ' ')
  const price = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(product.clientPricePerVisitExGstCents / 100)
  const access = [sale.siteAccessNotes, sale.siteAlarmNotes].filter(Boolean).join(' | ')
  return {
    agreementDate: today(), secureCleaningLegalName: 'Secure Cleaning', secureCleaningAbn: '81 674 121 825', secureCleaningAddress: '',
    serviceProviderLegalName: sale.cleanerBusiness || sale.cleanerName, serviceProviderRepresentative: sale.cleanerName,
    serviceProviderAbn: sale.cleanerAbn, serviceProviderAddress: sale.cleanerAddress, serviceProviderEmail: sale.cleanerEmail,
    clientLegalName: sale.clientBusiness || sale.clientName, clientAbn: '', clientAddress: sale.siteAddress,
    clientContact: sale.clientName, clientEmail: sale.clientEmail, siteName: sale.siteName, siteAddress: sale.siteAddress,
    commencementDate: sale.commencementDate || product.startDate, serviceFrequency: frequency,
    serviceWindow: '', estimatedDuration: product.estimatedHoursPerVisit,
    routineFee: `${price} plus GST per visit`, billingParty: 'Service Provider', paymentTerms: '14 days from invoice',
    consumablesVariation: '', specialistItems: '', accessAndAlarm: emptyRequirement(access), storage: emptyRequirement(),
    security: emptyRequirement(), hazardsAndInduction: emptyRequirement(sale.siteInductionNotes), infectionControl: emptyRequirement(),
    exclusions: emptyRequirement(), variations: emptyRequirement(),
  }
}

function statusTone(status: string) {
  if (['completed', 'paid', 'signed'].includes(status)) return 'bg-green-100 text-green-800'
  if (['cancelled', 'void', 'rejected', 'failed'].includes(status)) return 'bg-red-100 text-red-800'
  if (['deposit_due', 'balance_due', 'pending', 'agreement_pending'].includes(status)) return 'bg-amber-100 text-amber-800'
  return 'bg-blue-100 text-blue-800'
}

function AgreementPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  return <article className="mt-4 max-h-[42rem] overflow-auto rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed shadow-inner">
    {lines.map((raw, index) => {
      const line = raw.trim()
      if (!line) return <div key={index} className="h-2" />
      if (index === 0) return <h3 key={index} className="text-xl font-bold uppercase tracking-tight text-gray-900">{line}</h3>
      if (index === 1 && /DRAFT FOR REVIEW/i.test(line)) return <p key={index} className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-900">{line}</p>
      if (/^(PARTIES|BACKGROUND|AGREEMENT DETAILS|SCHEDULE \d+|APPENDIX [A-Z]|SITE-SPECIFIC|EXECUTION|\d+\. [A-Z][A-Z ,/&-]+|PURCHASER|SERVICE PROVIDER|CLIENT|SECURE CLEANING|IMPORTANT:)/.test(line)) {
        return <h4 key={index} className="mt-5 border-l-4 border-teal-600 bg-teal-50 px-3 py-2 font-bold text-teal-900">{line}</h4>
      }
      const detail = line.match(/^([A-Za-z][A-Za-z ]{1,38}):\s*(.*)$/)
      if (detail) return <div key={index} className="grid gap-1 border-b border-gray-100 py-1.5 sm:grid-cols-[190px_1fr]"><strong className="text-gray-600">{detail[1]}</strong><span>{detail[2]}</span></div>
      return <p key={index} className="mt-2 text-gray-800">{line}</p>
    })}
  </article>
}

type ClientAgreementTextField = {
  [Key in keyof ClientServiceAgreementDetails]: ClientServiceAgreementDetails[Key] extends string ? Key : never
}[keyof ClientServiceAgreementDetails]
type ClientAgreementRequirementField = Exclude<keyof ClientServiceAgreementDetails, ClientAgreementTextField>

function ClientServiceAgreementEditor({ sale, product, draft, busy, onChange, onCreate, onUpload }: {
  sale: ContractSale
  product: ContractProduct
  draft: ClientServiceAgreementDetails
  busy: boolean
  onChange: (value: ClientServiceAgreementDetails) => void
  onCreate: () => void
  onUpload: (file: File | null) => void
}) {
  const setText = (field: ClientAgreementTextField, value: string) => onChange({ ...draft, [field]: value })
  const setRequirement = (field: ClientAgreementRequirementField, value: ClientServiceAgreementRequirement) => onChange({ ...draft, [field]: value })
  const agreement = sale.clientServiceAgreement
  const requirementFields: Array<[ClientAgreementRequirementField, string]> = [
    ['accessAndAlarm', 'Access and alarm instructions'], ['storage', 'Storage arrangements'],
    ['security', 'Security or confidentiality requirements'], ['hazardsAndInduction', 'Known hazards and induction requirements'],
    ['infectionControl', 'Special infection-control requirements'], ['exclusions', 'Agreed exclusions'], ['variations', 'Approved variations'],
  ]
  return <section className="space-y-5">
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold">Client service agreement</h3>
      <p className="mt-1 text-sm text-gray-600">Create a separate three-party cleaning agreement for Secure Cleaning, the selected cleaner and the client. The current product scope is appended automatically as Appendix A.</p>
      {!product.formalContract ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This product is not currently marked as requiring a client service agreement. You can still create one if the client has requested it.</p> : null}
      {agreement ? <>
        <AgreementPreview content={agreement.content} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(agreement.status)}`}>Version {agreement.version} · {agreement.status}</span>
          <a href={`/api/admin/contract-sales/client-service-agreements?saleId=${sale.id}&agreementId=${agreement.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800">Download generated PDF</a>
          {agreement.signedFileName
            ? <a href={`/api/admin/contract-sales/client-service-agreements?saleId=${sale.id}&agreementId=${agreement.id}&signed=1`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Download signed PDF</a>
            : <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Upload signed PDF<input type="file" accept="application/pdf" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0] ?? null)} /></label>}
        </div>
      </> : null}
    </div>

    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Agreement details</h3><p className="text-sm text-gray-600">Values are filled from the sale, cleaner, client and product records. Override any field before creating an immutable agreement version.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">12 months · 30 days notice · $10m public liability</span></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Agreement date<input type="date" value={draft.agreementDate} onChange={(event) => setText('agreementDate', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Commencement date<input type="date" value={draft.commencementDate} onChange={(event) => setText('commencementDate', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Secure Cleaning legal name<input value={draft.secureCleaningLegalName} onChange={(event) => setText('secureCleaningLegalName', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Secure Cleaning ABN<input value={draft.secureCleaningAbn} onChange={(event) => setText('secureCleaningAbn', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Secure Cleaning address<input value={draft.secureCleaningAddress} onChange={(event) => setText('secureCleaningAddress', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>

        <label className="text-sm font-medium">Service Provider legal/business name<input value={draft.serviceProviderLegalName} onChange={(event) => setText('serviceProviderLegalName', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Service Provider representative<input value={draft.serviceProviderRepresentative} onChange={(event) => setText('serviceProviderRepresentative', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Service Provider ABN<input value={draft.serviceProviderAbn} onChange={(event) => setText('serviceProviderAbn', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Service Provider email<input type="email" value={draft.serviceProviderEmail} onChange={(event) => setText('serviceProviderEmail', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Service Provider address<input value={draft.serviceProviderAddress} onChange={(event) => setText('serviceProviderAddress', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>

        <label className="text-sm font-medium">Client legal/business name<input value={draft.clientLegalName} onChange={(event) => setText('clientLegalName', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Client ABN/ACN<input value={draft.clientAbn} onChange={(event) => setText('clientAbn', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Client contact<input value={draft.clientContact} onChange={(event) => setText('clientContact', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Client email<input type="email" value={draft.clientEmail} onChange={(event) => setText('clientEmail', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Client address<input value={draft.clientAddress} onChange={(event) => setText('clientAddress', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>

        <label className="text-sm font-medium">Site name<input value={draft.siteName} onChange={(event) => setText('siteName', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Service frequency<input value={draft.serviceFrequency} onChange={(event) => setText('serviceFrequency', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Site address<input value={draft.siteAddress} onChange={(event) => setText('siteAddress', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Service days and window<input value={draft.serviceWindow} onChange={(event) => setText('serviceWindow', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Estimated duration<input value={draft.estimatedDuration} onChange={(event) => setText('estimatedDuration', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Routine client fee<input value={draft.routineFee} onChange={(event) => setText('routineFee', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Billing party<input value={draft.billingParty} onChange={(event) => setText('billingParty', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Payment terms<input value={draft.paymentTerms} onChange={(event) => setText('paymentTerms', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Consumables variation<textarea rows={2} value={draft.consumablesVariation} onChange={(event) => setText('consumablesVariation', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Specialist chemicals or equipment<textarea rows={2} value={draft.specialistItems} onChange={(event) => setText('specialistItems', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      </div>

      <h4 className="mt-6 font-bold">Site-specific requirements</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {requirementFields.map(([field, label]) => {
          const value = draft[field]
          return <div key={field} className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{label}</strong><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={value.notApplicable} onChange={(event) => setRequirement(field, { ...value, notApplicable: event.target.checked })} /> Not applicable</label></div><textarea rows={2} value={value.details} onChange={(event) => setRequirement(field, { ...value, details: event.target.value })} placeholder="Optional details" className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
        })}
      </div>
      <button type="button" disabled={busy} onClick={onCreate} className="mt-5 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{agreement ? 'Create updated agreement version' : 'Create client service agreement'}</button>
    </div>
  </section>
}

export default function ContractSalesWorkspace({ portal = 'admin', assigneeId = '', initialProductId = '', initialSaleId = '', initialInvoiceId = '', initialTab = 'overview' }: {
  portal?: 'admin' | 'agent'
  assigneeId?: string
  initialProductId?: string
  initialSaleId?: string
  initialInvoiceId?: string
  initialTab?: 'overview' | 'invoices' | 'inspection'
}) {
  const invoiceSelectionApplied = useRef(false)
  const [data, setData] = useState<Data | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState('')
  const selectedSaleRef = useRef(selectedSaleId)
  selectedSaleRef.current = selectedSaleId
  const [creatingSale, setCreatingSale] = useState(Boolean(initialProductId && !initialSaleId && !initialInvoiceId))
  const [selectedProductId, setSelectedProductId] = useState(initialProductId)
  const [selectedCleanerId, setSelectedCleanerId] = useState('')
  const [saleSearch, setSaleSearch] = useState('')
  const [tab, setTab] = useState<SaleTab>(initialTab)
  const [busy, setBusy] = useState('')
  const [invoicePreview, setInvoicePreview] = useState<{ saleId: string; invoiceId: string; invoiceNumber: string } | null>(null)
  const [emailPreview, setEmailPreview] = useState<InvoiceEmailPreview | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<FeedbackTone>('success')
  const [newCleaner, setNewCleaner] = useState({ businessName: '', firstName: '', lastName: '', email: '', phone: '', suburb: '' })
  const [startSaleError, setStartSaleError] = useState('')
  const [saleDraft, setSaleDraft] = useState({ finalPrice: '', commencementDate: '', notes: '' })
  const [payment, setPayment] = useState({ invoiceId: '', amount: '', receivedOn: today(), method: 'bank_transfer', reference: '', evidenceNote: '' })
  const [paymentRequestId, setPaymentRequestId] = useState(() => crypto.randomUUID())
  const [handoverDate, setHandoverDate] = useState(today())
  const [cancelReason, setCancelReason] = useState('')
  const [showInvoiceTemplate, setShowInvoiceTemplate] = useState(false)
  const [invoiceTemplateDraft, setInvoiceTemplateDraft] = useState<ContractSaleInvoiceTemplate | null>(null)
  const [showCleanerProfileTemplate, setShowCleanerProfileTemplate] = useState(false)
  const [cleanerProfileTemplateDraft, setCleanerProfileTemplateDraft] = useState<ContractSaleCleanerProfileTemplate | null>(null)
  const [handoverResetKeys, setHandoverResetKeys] = useState({ client: 0, cleaner: 0 })
  const [showHandoverTemplates, setShowHandoverTemplates] = useState(false)
  const [handoverTemplateDrafts, setHandoverTemplateDrafts] = useState<Record<'client' | 'cleaner', ContractSaleHandoverEmailTemplate> | null>(null)
  const [clientAgreementDraft, setClientAgreementDraft] = useState<ClientServiceAgreementDetails | null>(null)

  const showMessage = useCallback((text: string, tone: FeedbackTone = 'success') => {
    setMessageTone(tone)
    setMessage(text)
  }, [])

  const load = useCallback(async (preferredSaleId = '') => {
    const response = await fetch('/api/admin/contract-sales', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load product sales.')
    const next = result as Data
    const requestedSale = !creatingSale && (initialSaleId || initialInvoiceId)
      ? resolveInvoiceSelection(next.sales, next.actor, initialSaleId, initialInvoiceId) : null
    setData(next)
    setInvoiceTemplateDraft(next.invoiceTemplate)
    setCleanerProfileTemplateDraft(next.cleanerProfileTemplate)
    setHandoverTemplateDrafts(next.handoverTemplates)
    const matchingSale = next.sales.find((sale) => sale.id === (preferredSaleId || selectedSaleRef.current))
      ?? requestedSale
      ?? next.sales.find((sale) => sale.productId === initialProductId)
      ?? (initialProductId || creatingSale ? undefined : next.sales[0])
    setSelectedSaleId(matchingSale?.id ?? '')
    if (matchingSale) {
      if (initialInvoiceId && matchingSale.id === initialSaleId && !invoiceSelectionApplied.current) {
        const invoice = matchingSale.invoices.find(item => item.id === initialInvoiceId)!
        setPayment(current => ({ ...current, invoiceId: ['paid', 'void'].includes(invoice.status) ? '' : invoice.id }))
        invoiceSelectionApplied.current = true
      }
      setPayment(current => current.invoiceId && !matchingSale.invoices.some(item => item.id === current.invoiceId)
        ? { ...current, invoiceId: '', amount: '', reference: '', evidenceNote: '' } : current)
      setSelectedProductId(matchingSale.productId)
      setSaleDraft({ finalPrice: (matchingSale.agreedPurchasePriceIncGstCents / 100).toFixed(2), commencementDate: matchingSale.commencementDate, notes: matchingSale.notes })
    } else if (!next.products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(next.products.find((product) => product.status === 'available')?.id ?? '')
    }
  }, [creatingSale, initialProductId, initialSaleId, initialInvoiceId, selectedProductId])

  useEffect(() => { void load().catch((error) => showMessage(error instanceof Error ? error.message : 'Unable to load.', 'error')) }, [load, showMessage])
  const sale = data?.sales.find((item) => item.id === selectedSaleId) ?? null
  const product = data?.products.find((item) => item.id === (sale?.productId ?? selectedProductId)) ?? null
  useEffect(() => {
    if (!sale || !product) return setClientAgreementDraft(null)
    setClientAgreementDraft(sale.clientServiceAgreement?.details ?? clientAgreementDefaults(sale, product))
  }, [sale, product])
  const stateCleaners = useMemo(() => (data?.cleaners ?? []).filter((cleaner) => !product || cleaner.state === product.state), [data, product])
  const selectedCleaner = stateCleaners.find((cleaner) => cleaner.id === selectedCleanerId) ?? null
  const activeSaleProductIds = new Set((data?.sales ?? []).filter((item) => item.status !== 'cancelled').map((item) => item.productId))
  const availableProducts = (data?.products ?? []).filter((item) => item.status === 'available' && !activeSaleProductIds.has(item.id))
  const filteredSales = useMemo(() => {
    const query = saleSearch.trim().toLocaleLowerCase('en-AU')
    if (!query) return data?.sales ?? []
    return (data?.sales ?? []).filter((item) => [
      item.saleCode,
      item.productCode,
      item.clientBusiness,
      item.clientName,
      item.clientEmail,
      item.cleanerName,
      item.cleanerBusiness,
      item.suburb,
      item.state,
      item.status.replaceAll('_', ' '),
    ].some((value) => value.toLocaleLowerCase('en-AU').includes(query)))
  }, [data?.sales, saleSearch])

  async function action(actionName: string, payload: Record<string, unknown>, preferredSaleId = selectedSaleId) {
    setBusy(actionName); setMessage('')
    try {
      const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to complete this action.')
      const id = result.result?.saleId ?? preferredSaleId
      await load(id)
      return result.result
    } finally { setBusy('') }
  }

  async function startSale() {
    setStartSaleError('')
    try {
      const result = await action('sale.create', { productId: selectedProductId, cleanerId: selectedCleanerId }, '')
      setCreatingSale(false); setSelectedSaleId(result.saleId); showMessage('Product reserved and product sale created.')
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Unable to start sale.'
      setStartSaleError(failure)
      showMessage(failure, 'error')
    }
  }

  async function createCleaner() {
    if (!product) return
    try {
      const result = await action('cleaner.create', { ...newCleaner, state: product.state }, '')
      showMessage('Cleaner created as pending approval. Approve the cleaner record before starting the sale.')
      setSelectedCleanerId(result.cleanerId)
      setNewCleaner({ businessName: '', firstName: '', lastName: '', email: '', phone: '', suburb: '' })
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to create cleaner.', 'error') }
  }

  async function run(actionName: string, payload: Record<string, unknown>, success: string) {
    if (!sale) return
    try {
      const result = await action(actionName, { saleId: sale.id, ...payload })
      if (actionName === 'payment.record') {
        setPayment({ invoiceId: '', amount: '', receivedOn: today(), method: 'bank_transfer', reference: '', evidenceNote: '' })
        setPaymentRequestId(crypto.randomUUID())
      }
      if (actionName === 'agreement.send' && result?.cleanerProfileEmail === 'sent') {
        showMessage(`${success} As this was the cleaner's first invoice, a secure details-update email was also sent and copied to the sale-creating agent.`)
      } else if (actionName === 'agreement.send' && ['failed', 'unknown'].includes(result?.cleanerProfileEmail)) {
        showMessage(`${success} The separate cleaner details-update email could not be confirmed. Check the cleaner record and email provider history before sending a manual secure link.`, 'info')
      } else showMessage(success)
    }
    catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to complete this action.', 'error') }
  }

  async function saveInvoiceTemplate() {
    if (!invoiceTemplateDraft) return
    try {
      await action('invoice-template.update', invoiceTemplateDraft)
      showMessage('Invoice template saved for future invoices. For an existing invoice, use Apply saved payment details beside its preview.')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to save the invoice template.', 'error') }
  }

  async function saveCleanerProfileTemplate() {
    if (!cleanerProfileTemplateDraft) return
    try {
      await action('cleaner-profile-template.update', cleanerProfileTemplateDraft)
      showMessage('First-purchase cleaner details email template saved.')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to save the cleaner details email template.', 'error') }
  }

  async function saveHandoverTemplate(audience: 'client' | 'cleaner') {
    const template = handoverTemplateDrafts?.[audience]
    if (!template) return
    try {
      setBusy('handover-template.update')
      const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'handover-template.update', ...template }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save the handover template.')
      const saved = result.result.handoverTemplate as ContractSaleHandoverEmailTemplate
      setData(current => current ? { ...current, handoverTemplates: { ...current.handoverTemplates, [audience]: saved } } : current)
      setHandoverTemplateDrafts(current => current ? { ...current, [audience]: saved } : current)
      showMessage(`${audience === 'client' ? 'Client' : 'Cleaner'} handover email template saved.`)
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to save the handover email template.', 'error') }
    finally { setBusy('') }
  }

  async function previewInvoiceEmail(invoiceId: string, deliveryId: string) {
    if (!sale) return
    setBusy('invoice-email.preview'); setMessage('')
    try {
      const response = await fetch('/api/admin/contract-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invoice-email.preview', saleId: sale.id, invoiceId, deliveryId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to open the archived invoice email.')
      setEmailPreview(result.result as InvoiceEmailPreview)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to open the archived invoice email.', 'error')
    } finally { setBusy('') }
  }


  async function uploadAgreement(file: File | null) {
    if (!sale?.agreement || !file) return
    setBusy('agreement.upload'); setMessage('')
    try {
      const form = new FormData(); form.set('saleId', sale.id); form.set('agreementId', sale.agreement.id); form.set('file', file)
      const response = await fetch('/api/admin/contract-sales/agreements', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload agreement.')
      await load(sale.id); showMessage('Signed agreement uploaded.')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to upload agreement.', 'error') }
    finally { setBusy('') }
  }

  async function uploadClientServiceAgreement(file: File | null) {
    if (!sale?.clientServiceAgreement || !file) return
    setBusy('client-service-agreement.upload'); setMessage('')
    try {
      const form = new FormData()
      form.set('saleId', sale.id)
      form.set('agreementId', sale.clientServiceAgreement.id)
      form.set('file', file)
      const response = await fetch('/api/admin/contract-sales/client-service-agreements', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload client service agreement.')
      await load(sale.id)
      showMessage('Signed client service agreement uploaded.')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to upload client service agreement.', 'error') }
    finally { setBusy('') }
  }

  if (!data) return <div className="rounded-xl border border-gray-200 bg-white p-6">{message || 'Loading product sales...'}</div>
  const base = portal === 'agent' ? `/availability` : '/admin'
  const productsHref = portal === 'agent' ? `/availability/products/${encodeURIComponent(assigneeId)}` : '/admin/products'
  const clientsHref = sale ? (portal === 'agent' ? `/availability/clients/${encodeURIComponent(assigneeId)}?opportunity=${sale.opportunityId}` : `/admin/clients?opportunity=${sale.opportunityId}`) : ''
  const quoteHref = sale?.sourceQuoteRef ? (portal === 'agent' ? `/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(sale.sourceQuoteRef)}?opportunity=${sale.opportunityId}` : `/admin/quotes/${encodeURIComponent(sale.sourceQuoteRef)}?opportunity=${sale.opportunityId}`) : ''
  const fullInvoice = sale?.invoices.find((invoice) => invoice.invoiceType === 'sale' && invoice.status !== 'void')
  const legacyDeposit = sale?.invoices.find((invoice) => invoice.invoiceType === 'deposit' && invoice.status !== 'void')
  const legacyBalance = sale?.invoices.find((invoice) => invoice.invoiceType === 'balance' && invoice.status !== 'void')
  const primaryInvoice = fullInvoice ?? legacyBalance ?? legacyDeposit
  const depositConfirmed = Boolean(fullInvoice ? fullInvoice.paidCents >= fullInvoice.depositRequiredIncGstCents : legacyDeposit?.status === 'paid')
  const balanceComplete = Boolean(fullInvoice?.status === 'paid' || legacyBalance?.status === 'paid' || sale?.paymentPlan?.status === 'active')

  return <div>
    <AdminPageHeader title="Product Sales" description="Confirm the final price, prepare the tax invoice and agreement in either order, send both documents together, then collect the deposit and coordinate the handover." />
    <ActionToast message={message} tone={messageTone} onDismiss={() => setMessage('')} />

    {(data.actor.role === 'owner' || data.actor.role === 'manager') && invoiceTemplateDraft ? <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={() => setShowInvoiceTemplate((current) => !current)} aria-expanded={showInvoiceTemplate} className="flex w-full items-center justify-between gap-4 p-5 text-left"><span><strong className="block text-lg">Invoice template</strong><span className="text-sm font-normal text-gray-600">Edit the global supplier, email and tax-invoice wording used for future product sales.</span></span><span className="text-sm font-semibold text-teal-700">{showInvoiceTemplate ? 'Close' : 'Edit template'}</span></button>
      {showInvoiceTemplate ? <div className="border-t border-gray-200 p-5">
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Saving the template does not change issued invoices. The owner can apply saved payment details to an existing invoice below. The sending agent&apos;s name, title and email always come from their staff account.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">Supplier name<input value={invoiceTemplateDraft.supplierName} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, supplierName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Supplier ABN<input value={invoiceTemplateDraft.supplierAbn} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, supplierAbn: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Supplier email<input type="email" value={invoiceTemplateDraft.supplierEmail} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, supplierEmail: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Invoice title<input value={invoiceTemplateDraft.invoiceTitle} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, invoiceTitle: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium md:col-span-2">Line-item description<input value={invoiceTemplateDraft.lineItemTemplate} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, lineItemTemplate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium md:col-span-3">Email subject<input value={invoiceTemplateDraft.emailSubjectTemplate} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, emailSubjectTemplate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <div className="md:col-span-3"><RichEmailEditor mergeFields={[INDUSTRY_MERGE_FIELD]} label="Email introduction" value={createRichEmailContent({ text: invoiceTemplateDraft.emailIntroTemplate, html: invoiceTemplateDraft.emailIntroHtml, document: invoiceTemplateDraft.emailIntroDocument })} resetKey={`invoice-intro-${invoiceTemplateDraft.updatedAt || 'default'}`} disabled={Boolean(busy)} onChange={content => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, emailIntroTemplate: content.text, emailIntroHtml: content.html, emailIntroDocument: content.document })} /></div>
<div className="md:col-span-3"><h4 className="font-semibold">Bank payment details</h4><p className="text-sm text-gray-600">Saved for new invoices. To correct an existing invoice, the owner can apply these saved payment details beside its preview.</p></div>
          <label className="text-sm font-medium">Account name<input value={invoiceTemplateDraft.bankAccountName} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, bankAccountName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Bank name (optional)<input value={invoiceTemplateDraft.bankName} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, bankName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">BSB<input value={invoiceTemplateDraft.bankBsb} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, bankBsb: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Account number<input value={invoiceTemplateDraft.bankAccountNumber} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, bankAccountNumber: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Payment reference<input value={invoiceTemplateDraft.paymentReferenceTemplate} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, paymentReferenceTemplate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium md:col-span-3">Payment terms<textarea rows={4} value={invoiceTemplateDraft.paymentTermsTemplate} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, paymentTermsTemplate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium md:col-span-3">Invoice footer<textarea rows={2} value={invoiceTemplateDraft.footerNote} onChange={(event) => setInvoiceTemplateDraft({ ...invoiceTemplateDraft, footerNote: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        </div>
        <p className="mt-3 text-xs text-gray-600">Available tokens: {'<<industry>>'}, {'{invoice_number}'}, {'{product_code}'}, {'{sale_code}'}, {'{cleaner_name}'}, {'{cleaner_business}'}, {'{suburb}'}, {'{state}'}, {'{total_inc_gst}'}, {'{deposit_inc_gst}'}, {'{balance_inc_gst}'}, {'{agent_name}'}, {'{agent_title}'}.</p>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveInvoiceTemplate()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save invoice template</button><button type="button" onClick={() => setInvoiceTemplateDraft(data.invoiceTemplate)} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Discard edits</button></div>
      </div> : null}
    </section> : null}

    {(data.actor.role === 'owner' || data.actor.role === 'manager') && handoverTemplateDrafts ? <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={() => setShowHandoverTemplates((current) => !current)} aria-expanded={showHandoverTemplates} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <span><strong className="block text-lg">Handover introduction emails</strong><span className="text-sm font-normal text-gray-600">Edit the reusable client and cleaner introductions used after a completed product sale.</span></span>
        <span className="text-sm font-semibold text-teal-700">{showHandoverTemplates ? 'Close' : 'Edit templates'}</span>
      </button>
      {showHandoverTemplates ? <div className="border-t border-gray-200 p-5">
        <p className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">These master templates fill from the selected product sale when an introduction is prepared. The agent can still edit that individual message and must preview it before sending. Saving here changes future drafts only; sent email history remains unchanged.</p>
        <div className="grid gap-6 xl:grid-cols-2">
          {(['client', 'cleaner'] as const).map((audience) => {
            const draft = handoverTemplateDrafts[audience]
            return <div key={audience} className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold">Email {audience === 'client' ? 'client: introduce cleaner' : 'cleaner: introduce client'}</h3>
              <label className="mt-4 block text-sm font-medium">Email subject<input maxLength={200} value={draft.subject} onChange={(event) => setHandoverTemplateDrafts({ ...handoverTemplateDrafts, [audience]: { ...draft, subject: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /><span className="mt-2 block"><EmailMergeFieldPicker fields={HANDOVER_EMAIL_MERGE_FIELDS} onInsert={(token) => setHandoverTemplateDrafts({ ...handoverTemplateDrafts, [audience]: { ...draft, subject: appendEmailMergeField(draft.subject, token) } })} /></span></label>
              <div className="mt-4"><RichEmailEditor label="Email message" value={createRichEmailContent({ text: draft.bodyText, html: draft.bodyHtml, document: draft.bodyDocument })} resetKey={`handover-${audience}-${draft.updatedAt || 'default'}-${handoverResetKeys[audience]}`} disabled={Boolean(busy)} mergeFields={HANDOVER_EMAIL_MERGE_FIELDS} onChange={(content) => setHandoverTemplateDrafts({ ...handoverTemplateDrafts, [audience]: { ...draft, bodyText: content.text, bodyHtml: content.html, bodyDocument: content.document } })} /></div>
              <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveHandoverTemplate(audience)} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save {audience} template</button><button type="button" disabled={Boolean(busy)} onClick={() => { setHandoverTemplateDrafts({ ...handoverTemplateDrafts, [audience]: data.handoverTemplates[audience] }); setHandoverResetKeys(current => ({ ...current, [audience]: current[audience] + 1 })) }} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Discard edits</button></div>
            </div>
          })}
        </div>
      </div> : null}
    </section> : null}

    {(data.actor.role === 'owner' || data.actor.role === 'manager') && cleanerProfileTemplateDraft ? <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={() => setShowCleanerProfileTemplate((current) => !current)} aria-expanded={showCleanerProfileTemplate} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <span><strong className="block text-lg">First-purchase cleaner details email</strong><span className="text-sm font-normal text-gray-600">Review the separate email sent once when a cleaner receives their first Secure Cleaning invoice.</span></span>
        <span className="text-sm font-semibold text-teal-700">{showCleanerProfileTemplate ? 'Close' : 'Edit template'}</span>
      </button>
      {showCleanerProfileTemplate ? <div className="border-t border-gray-200 p-5">
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">The email is sent only after the first tax invoice is successfully delivered. It contains a private 48-hour profile-update link and copies the active agent who created the product sale. Later invoices and invoice-only resends do not send it again.</p>
        <label className="block text-sm font-medium">Email subject<input value={cleanerProfileTemplateDraft.subject} onChange={(event) => setCleanerProfileTemplateDraft({ ...cleanerProfileTemplateDraft, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <div className="mt-4"><RichEmailEditor label="Email message" value={createRichEmailContent({ text: cleanerProfileTemplateDraft.bodyText, html: cleanerProfileTemplateDraft.bodyHtml, document: cleanerProfileTemplateDraft.bodyDocument })} resetKey={`cleaner-profile-${cleanerProfileTemplateDraft.updatedAt || 'default'}`} disabled={Boolean(busy)} mergeFields={CLEANER_PROFILE_UPDATE_EMAIL_MERGE_FIELDS} onChange={content => setCleanerProfileTemplateDraft({ ...cleanerProfileTemplateDraft, bodyText: content.text, bodyHtml: content.html, bodyDocument: content.document })} /></div>
        <p className="mt-3 text-xs text-gray-600">The template must include &lt;&lt;profile_update_link&gt;&gt;. The default template displays it as a button.</p>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveCleanerProfileTemplate()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save cleaner details email template</button><button type="button" onClick={() => setCleanerProfileTemplateDraft(data.cleanerProfileTemplate)} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Discard edits</button></div>
      </div> : null}
    </section> : null}

    <div className="mb-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Product sales</h2><button type="button" onClick={() => { setCreatingSale(true); setSelectedSaleId(''); setSelectedProductId(availableProducts[0]?.id ?? ''); setSelectedCleanerId('') }} className="rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800">New sale</button></div>
        <label className="mt-3 block text-xs font-semibold text-gray-700">Search product sales<span className="sr-only"> by sale, client, cleaner, location or status</span><input type="search" value={saleSearch} onChange={(event) => setSaleSearch(event.target.value)} placeholder="Sale, client or cleaner" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal" /></label>
        {saleSearch ? <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500"><span>{filteredSales.length} of {data.sales.length} sales</span><button type="button" onClick={() => setSaleSearch('')} className="font-semibold text-teal-700 underline">Clear search</button></div> : null}
        <div className="mt-3 max-h-[64vh] space-y-2 overflow-y-auto">
          {filteredSales.map((item) => <button key={item.id} type="button" onClick={() => { setCreatingSale(false); setSelectedSaleId(item.id); setSelectedProductId(item.productId); setSaleDraft({ finalPrice: (item.agreedPurchasePriceIncGstCents / 100).toFixed(2), commencementDate: item.commencementDate, notes: item.notes }) }} className={`w-full rounded-xl border p-3 text-left ${selectedSaleId === item.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}><strong className="block">{item.saleCode}</strong><span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{item.productCode}</span><span className="mt-1 block text-sm"><span className="font-semibold">Client:</span> {item.clientBusiness || item.clientName || 'Not provided'}</span><span className="block text-sm text-gray-600"><span className="font-semibold">Cleaner:</span> {item.cleanerBusiness || item.cleanerName || 'Not provided'}</span><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{item.status.replaceAll('_', ' ')}</span></button>)}
          {data.sales.length === 0 ? <p className="text-sm text-gray-500">No product sales yet.</p> : null}
          {data.sales.length > 0 && filteredSales.length === 0 ? <p role="status" className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">No product sales match your search.</p> : null}
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        {!sale ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Start a product sale</h2>
          <p className="mt-1 text-sm text-gray-600">Only approved cleaners can reserve a product and receive the $500 deposit invoice. <Link href={portal === 'agent' ? `/availability/cleaners/${encodeURIComponent(assigneeId)}` : '/admin/cleaners'} className="font-semibold text-teal-700 underline">Open cleaner records</Link> to approve a newly added cleaner.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Available product<select value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setSelectedCleanerId('') }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select product</option>{availableProducts.map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.suburb}, {item.state}</option>)}</select></label>
            <label className="text-sm font-medium">Approved cleaner<select value={selectedCleanerId} onChange={(event) => setSelectedCleanerId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select cleaner</option>{stateCleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id} disabled={cleaner.status !== 'approved'}>{cleaner.businessName} · {cleaner.status.replaceAll('_', ' ')} · compliance {cleaner.complianceStatus.replaceAll('_', ' ')}</option>)}</select>{selectedCleaner && selectedCleaner.complianceStatus !== 'current' ? <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-normal text-amber-900">Compliance is recorded as {selectedCleaner.complianceStatus.replaceAll('_', ' ')}. This is a warning only; the approved cleaner status controls sale eligibility.</span> : <span className="mt-1 block text-xs font-normal text-gray-500">Compliance is shown for review but does not block an approved cleaner from being selected.</span>}</label>
          </div>
          <button type="button" onClick={() => void startSale()} disabled={!selectedProductId || !selectedCleanerId || Boolean(busy)} className="mt-4 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy === 'sale.create' ? 'Starting sale...' : 'Reserve product & start sale'}</button>
          {startSaleError ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{startSaleError}</p> : null}
          <details className="mt-6 rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer font-semibold">Add a new cleaner</summary><p className="mt-2 text-sm text-gray-600">The new record starts as pending approval and cannot receive an invoice until approved.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(['businessName', 'firstName', 'lastName', 'email', 'phone', 'suburb'] as const).map((field) => <label key={field} className="text-sm font-medium">{field.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}<input type={field === 'email' ? 'email' : 'text'} value={newCleaner[field]} onChange={(event) => setNewCleaner({ ...newCleaner, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>)}</div><button type="button" onClick={() => void createCleaner()} disabled={!product || Boolean(busy)} className="mt-4 rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800">Create pending cleaner</button></details>
        </section> : !product ? <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">The product linked to this sale could not be loaded. Refresh the page or review the product record before continuing.</section> : <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-sm font-semibold text-teal-700">{sale.saleCode}</p><h2 className="text-xl font-bold">{sale.productCode} · {sale.cleanerBusiness}</h2><p className="text-sm text-gray-600">{sale.suburb}, {sale.state} · {money(sale.agreedPurchasePriceIncGstCents)} inc GST</p></div><div className="ml-auto text-right"><span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusTone(sale.status)}`}>{sale.status.replaceAll('_', ' ')}</span><div className="mt-3"><span className="block text-xs font-bold uppercase tracking-wide text-gray-500">Client business</span><strong className="block text-base text-gray-900">{sale.clientBusiness || 'Not provided'}</strong>{sale.clientName ? <span className="block text-sm text-gray-700">Contact: {sale.clientName}</span> : null}{sale.clientEmail ? <span className="block text-sm text-gray-600">{sale.clientEmail}</span> : null}</div></div></div>
            <nav aria-label="Connected records" className="mt-5 flex flex-wrap gap-2"><Link href={clientsHref} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Client</Link>{quoteHref ? <Link href={quoteHref} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Quote</Link> : null}<Link href={`${productsHref}?product=${encodeURIComponent(sale.productId)}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Product</Link><span className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Product sale</span></nav>
          </section>

          <section className="grid gap-2 sm:grid-cols-4 xl:grid-cols-9">{[
            ['Overview & price', sale.priceFinalised], ['Tax invoice', Boolean(primaryInvoice)], ['Purchase agreement', Boolean(sale.agreement)], ['Client agreement', sale.clientServiceAgreement ? sale.clientServiceAgreement.status === 'signed' : !product.formalContract], ['Documents sent', primaryInvoice?.deliveryStatus === 'sent' && ['sent', 'signed'].includes(sale.agreement?.status ?? '')], ['Deposit', depositConfirmed], ['Inspection', sale.inspection?.status === 'completed'], ['Balance / plan', balanceComplete], ['Handover', Boolean(sale.handoverAt)],
          ].map(([label, done], index) => <div key={String(label)} className={`rounded-xl border p-3 text-sm ${done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}><span className="block text-xs font-bold uppercase text-gray-500">{index + 1}</span><strong>{String(label)}</strong><span className="block text-xs">{done ? 'Complete' : 'Pending'}</span></div>)}</section>

          <div className="flex flex-wrap gap-2 border-b border-gray-200">{(['overview', 'invoices', 'agreement', 'clientAgreement', 'inspection', 'followup', 'activity'] as SaleTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`px-4 py-3 text-sm font-semibold capitalize ${tab === item ? 'border-b-2 border-teal-700 text-teal-800' : 'text-gray-600'}`}>{item === 'invoices' ? 'Tax invoice & payments' : item === 'agreement' ? 'Cleaner purchase agreement' : item === 'clientAgreement' ? 'Client service agreement' : item === 'followup' ? 'Follow up (optional)' : item}</button>)}</div>

          {tab === 'overview' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Sale overview and final price</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><span className="text-xs font-bold uppercase text-gray-500">Cleaner</span><p className="font-semibold">{sale.cleanerName}<br />{sale.cleanerEmail}</p></div><div><span className="text-xs font-bold uppercase text-gray-500">Client</span><p className="font-semibold">{sale.clientName}<br />{sale.clientEmail}</p></div><div><span className="text-xs font-bold uppercase text-gray-500">Site</span><p className="font-semibold">{sale.siteAddress || `${sale.suburb}, ${sale.state}`}</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Final purchase price (inc GST)<input type="number" min="500.01" step="0.01" value={saleDraft.finalPrice} disabled={Boolean(primaryInvoice || sale.agreement)} onChange={(event) => setSaleDraft({ ...saleDraft, finalPrice: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100" /><span className="mt-1 block text-xs font-normal text-gray-500">This price is used in both PDFs and locks when the first tax invoice or agreement snapshot is prepared.</span></label><label className="text-sm font-medium">Commencement date<input type="date" value={saleDraft.commencementDate} onChange={(event) => setSaleDraft({ ...saleDraft, commencementDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium md:col-span-2">Internal notes<textarea rows={3} value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><button type="button" onClick={() => void run('sale.update', saleDraft, 'Overview saved and final purchase price confirmed.')} disabled={Boolean(busy)} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Save overview &amp; final price</button>
            {!sale.handoverAt && sale.status !== 'cancelled' ? <details className="mt-6 border-t border-gray-200 pt-4"><summary className="cursor-pointer text-sm font-semibold text-red-700">Cancel this sale</summary><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Required cancellation reason" className="mt-3 w-full rounded-lg border border-red-200 p-3" /><button type="button" onClick={() => window.confirm('Cancel this product sale and release the product?') && void run('sale.cancel', { reason: cancelReason }, 'Sale cancelled and product released.')} className="mt-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Cancel sale</button></details> : null}</section> : null}

          {tab === 'inspection' ? <ContractSaleInspectionPanel sale={sale} product={product} template={data.inspectionTemplate} actorRole={data.actor.role} onRefresh={() => load(sale.id)} /> : null}

          {tab === 'overview' && data.actor.role === 'owner' ? <SalePriceAmendment key={`${sale.id}-${sale.updatedAt}`} sale={sale} busy={Boolean(busy)} onSave={async input => { await action('sale.amend', { saleId: sale.id, ...input }); showMessage('Sale amended. Review the revised invoice and purchase agreement, then send them for acceptance. Nothing has been emailed.'); setTab('agreement') }} /> : null}
          {tab === 'agreement' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Cleaner purchase agreement</h3><p className="mt-1 text-sm text-gray-600">Create the versioned agreement from the confirmed final price. The agreement and tax invoice may be prepared in either order; the send action emails both PDFs together.</p><div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Current signing method:</strong> returned signed PDF. Secure online acceptance remains a later enhancement until identity, intent, document-version and audit evidence are implemented.</div>{sale.agreement ? <><AgreementPreview content={sale.agreement.content} /><div className="mt-3 flex flex-wrap items-center gap-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(sale.agreement.status)}`}>Version {sale.agreement.version} · {sale.agreement.status}</span>{primaryInvoice ? <a href={`/api/admin/contract-sales/invoices?saleId=${sale.id}&invoiceId=${primaryInvoice.id}&preview=1`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-800">Preview invoice</a> : null}{sale.agreement.status === 'draft' ? <button type="button" disabled={!primaryInvoice || Boolean(busy)} onClick={() => void run('agreement.send', { agreementId: sale.agreement!.id }, 'Agreement and tax invoice sent to the cleaner as PDF attachments.')} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send agreement &amp; tax invoice</button> : null}{sale.agreement.status === 'draft' && !primaryInvoice ? <span className="text-xs text-amber-800">Prepare the tax invoice before sending.</span> : null}{sale.agreement.signedFileName ? <a href={`/api/admin/contract-sales/agreements?saleId=${sale.id}&agreementId=${sale.agreement.id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Download signed PDF</a> : <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Upload signed PDF<input type="file" accept="application/pdf" className="sr-only" onChange={(event) => void uploadAgreement(event.target.files?.[0] ?? null)} /></label>}{sale.paymentPlan && sale.agreement.type !== 'payment_plan' ? <button type="button" onClick={() => void run('agreement.create', {}, 'Payment-plan agreement version created.')} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Create payment-plan agreement</button> : <button type="button" onClick={() => void run('agreement.create', {}, 'Updated agreement draft created as a new immutable version.')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Create updated agreement version</button>}</div></> : <button type="button" disabled={!sale.priceFinalised || Boolean(busy)} onClick={() => void run('agreement.create', {}, 'Agreement draft created from the final purchase price.')} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Create agreement draft</button>}</section> : null}

          {tab === 'clientAgreement' && clientAgreementDraft ? <ClientServiceAgreementEditor
            sale={sale} product={product} draft={clientAgreementDraft} busy={Boolean(busy)}
            onChange={setClientAgreementDraft}
            onCreate={() => void run('client-service-agreement.create', { details: clientAgreementDraft }, sale.clientServiceAgreement ? 'Updated client service agreement version created.' : 'Client service agreement created with the current product scope attached.')}
            onUpload={(file) => void uploadClientServiceAgreement(file)}
          /> : null}

          {tab === 'invoices' ? <section className="space-y-5"><div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Sale tax invoice</h3><p className="text-sm text-gray-600">Prepare one full Australian tax invoice for the confirmed purchase price. Only the $500 GST-inclusive deposit is payable immediately. Preparing does not email it; the Agreement tab sends both PDFs together. Preview shows the current invoice, including confirmed payments. It is an updated copy, not an archived attachment from an earlier email.</p></div>{!primaryInvoice ? <button type="button" disabled={!sale.priceFinalised || Boolean(busy)} onClick={() => void run('invoice.issue', { idempotencyKey: crypto.randomUUID() }, 'Full tax invoice prepared. Create the agreement, then send both PDFs together.')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Prepare full tax invoice</button> : null}</div>{!primaryInvoice && !sale.priceFinalised ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Save the final GST-inclusive purchase price in Overview before preparing the invoice.</p> : null}<div className="mt-4 space-y-2">{sale.invoices.map((invoice) => <div key={invoice.id} className="grid gap-3 rounded-xl border border-gray-200 p-4 text-sm lg:grid-cols-[1fr_auto_auto_auto]"><div><strong>{invoice.invoiceNumber}{(invoice.revisionNumber ?? 1) > 1 ? ` · Revision ${invoice.revisionNumber}` : ''}</strong><p>{invoice.invoiceType === 'sale' ? 'Full sale tax invoice' : `Legacy ${invoice.invoiceType} invoice`}</p><p className="text-gray-500">Current payment terms and bank details are shown in Preview invoice.</p><p className="text-gray-500">Delivery: {invoice.deliveryStatus}{invoice.deliveryStatus === 'pending' ? ' · prepared, not yet emailed' : ' · PDF attachment'}</p>{invoice.invoiceType === 'sale' ? <p className="mt-1 font-medium text-teal-800">Deposit required {money(invoice.depositRequiredIncGstCents)} · Remaining after deposit {money(invoice.totalIncGstCents - invoice.depositRequiredIncGstCents)}</p> : null}</div><div className="font-semibold">Total {money(invoice.totalIncGstCents)}<span className="block text-xs text-gray-500">Paid {money(invoice.paidCents)} · Outstanding {money(invoice.totalIncGstCents - invoice.paidCents)}</span></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${statusTone(invoice.status)}`}>{invoice.status}</span><div className="flex h-fit flex-wrap gap-2">{data.actor.role === 'owner' && invoice.status !== 'void' && sale.status !== 'cancelled' ? <button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Apply the saved bank details and payment terms to ${invoice.invoiceNumber}?\n${data.invoiceTemplate.bankAccountName}\nBSB: ${data.invoiceTemplate.bankBsb}\nAccount: ${data.invoiceTemplate.bankAccountNumber}\nPayment reference: ${data.invoiceTemplate.paymentReferenceTemplate}\nPayment terms: ${data.invoiceTemplate.paymentTermsTemplate}\nThis updates current previews, downloads and future resends. It does not send an email or change the invoice amount, signed agreement or agreed payment-plan schedule.`)) void run('invoice-bank.apply', { invoiceId: invoice.id, templateUpdatedAt: data.invoiceTemplate.updatedAt, includePaymentTerms: true }, 'Saved bank details and payment terms applied to this invoice. Open Preview invoice to review. No email sent.') }} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold">Apply saved payment details</button> : null}{invoice.status !== 'void' ? <button type="button" onClick={() => setInvoicePreview({ saleId: sale.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber })} className="rounded-lg border border-teal-700 px-3 py-2 font-semibold text-teal-800">Preview invoice</button> : null}<a href={`/api/admin/contract-sales/invoices?saleId=${sale.id}&invoiceId=${invoice.id}`} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold">Download PDF</a>{invoice.status !== 'void' && invoice.deliveryStatus !== 'pending' ? <button type="button" disabled={Boolean(busy) || invoice.deliveryStatus === 'unknown'} onClick={() => void run('invoice.resend', { invoiceId: invoice.id }, 'Tax invoice email resent with its PDF attachment.')} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold">Resend invoice only</button> : null}</div><details className="lg:col-span-4 mt-4 border-t border-gray-100 pt-3"><summary className="cursor-pointer font-semibold text-gray-700">Invoice email history ({invoice.emailDeliveries.length})</summary>{invoice.emailDeliveries.length ? <div className="mt-3 space-y-2">{invoice.emailDeliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"><div><strong>{delivery.deliveryKind === 'document_bundle' ? 'Agreement and invoice email' : 'Invoice email'}</strong><p className="text-gray-600">To {delivery.recipientEmail} · {new Date(delivery.sentAt ?? delivery.createdAt).toLocaleString('en-AU')} · {delivery.deliveryStatus}</p><p className="text-xs text-gray-500">{delivery.subject}</p></div><button type="button" disabled={busy === 'invoice-email.preview'} onClick={() => void previewInvoiceEmail(invoice.id, delivery.id)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold disabled:opacity-50">View sent email</button></div>)}</div> : <p className="mt-2 text-gray-500">No archived email copies are available yet. New sends and resends will appear here.</p>}</details></div>)}</div></div>
            <PaymentPlanEditor key={`${sale.id}-${sale.paymentPlan?.id ?? 'new'}-${primaryInvoice?.paidCents ?? 0}-${primaryInvoice?.totalIncGstCents ?? 0}`} sale={sale} busy={Boolean(busy)} onSave={async instalments => { await action('payment-plan.create', { saleId: sale.id, instalments }); showMessage('Schedule approved. Create the payment-plan agreement and send both documents for cleaner acceptance.') }} />
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Record payment evidence</h3><p className="mt-1 text-sm text-gray-600">After recording, an owner or manager must select Confirm cleared. Confirmed payments reduce the invoice balance immediately and appear in previews, downloads and resends; pending evidence does not.</p><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Invoice<select value={payment.invoiceId} onChange={(event) => setPayment({ ...payment, invoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="">Select invoice</option>{sale.invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {money(invoice.totalIncGstCents - invoice.paidCents)} outstanding</option>)}</select></label><label className="text-sm font-medium">Amount<input type="number" step="0.01" min="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Received on<input type="date" value={payment.receivedOn} onChange={(event) => setPayment({ ...payment, receivedOn: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Method<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Reference<input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Evidence note<input value={payment.evidenceNote} onChange={(event) => setPayment({ ...payment, evidenceNote: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label></div><button type="button" disabled={Boolean(busy)} onClick={() => void run('payment.record', { ...payment, idempotencyKey: paymentRequestId }, 'Payment evidence recorded for confirmation.')} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Record payment</button><div className="mt-4 space-y-2">{sale.payments.filter((item) => item.status !== 'rejected').map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-sm"><span><strong>{money(item.amountCents)}</strong> · {item.receivedOn} · {item.reference}</span><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{item.status}</span>{item.status === 'pending' && item.invoiceId && ['owner', 'manager'].includes(data.actor.role) ? <><button type="button" disabled={Boolean(busy)} onClick={() => void run('payment.confirm', { paymentId: item.id, invoiceId: item.invoiceId }, 'Payment confirmed. Preview or resend the invoice to show the updated balance.')} className="rounded-lg border border-green-600 px-3 py-1.5 font-semibold text-green-700 disabled:opacity-50">Confirm cleared</button><button type="button" disabled={Boolean(busy)} onClick={() => window.confirm('Remove this pending payment entry? Confirmed invoice totals will not be changed.') && void run('payment.reject', { paymentId: item.id }, 'Pending payment entry removed.')} className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-700 disabled:opacity-50">Remove</button></> : null}</div></div>)}</div></div>


          </section> : null}

          {tab === 'followup' ? <ContractSaleFollowup key={sale.id} sale={sale} /> : null}
          {tab === 'activity' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Activity</h3><ContractNotes key={sale.id} kind="sale" recordId={sale.id} /><div className="mt-4 divide-y divide-gray-100">{sale.activity.map((item) => <div key={item.id} className="py-3 text-sm"><strong>{item.action.replaceAll('.', ' ')}</strong><span className="ml-2 text-gray-500">{new Date(item.createdAt).toLocaleString('en-AU')}</span></div>)}{sale.activity.length === 0 ? <p className="text-sm text-gray-500">No activity recorded.</p> : null}</div></section> : null}

            {!sale.handoverAt && sale.status !== 'cancelled' ? <section className="sticky bottom-4 rounded-2xl border border-green-200 bg-green-50 p-4 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Operational handover</strong><p className="text-sm text-gray-700">Requires the signed cleaner purchase agreement, {product.formalContract || sale.clientServiceAgreement ? 'signed client service agreement, ' : ''}full tax invoice, confirmed $500 deposit, completed inspection, and either full payment or an active payment plan.</p></div><div className="flex flex-wrap gap-2"><input type="date" value={handoverDate} onChange={(event) => setHandoverDate(event.target.value)} aria-label="Commencement date" className="min-w-0 rounded-lg border border-green-300 px-3 py-2" /><button type="button" onClick={() => window.confirm('Complete the cleaner handover and link this cleaner to the client site?') && void run('handover.complete', { commencedOn: handoverDate }, 'Operational handover completed.')} className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white">Complete handover</button></div></div></section> : null}
        </>}
      </main>
    </div>
    {invoicePreview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 p-4"><div><h2 id="invoice-preview-title" className="text-lg font-bold">Invoice preview</h2><p className="text-sm text-gray-600">{invoicePreview.invoiceNumber} · current invoice with confirmed payments.</p></div><button type="button" onClick={() => setInvoicePreview(null)} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Close</button></div>
        <iframe title={`Invoice preview ${invoicePreview.invoiceNumber}`} src={`/api/admin/contract-sales/invoices?saleId=${encodeURIComponent(invoicePreview.saleId)}&invoiceId=${encodeURIComponent(invoicePreview.invoiceId)}&preview=1`} className="min-h-0 flex-1 bg-gray-100" />
      </div>
    </div> : null}

    {emailPreview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="invoice-email-preview-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-4"><div><h2 id="invoice-email-preview-title" className="text-lg font-bold">Archived invoice email</h2><p className="text-sm text-gray-600">Retained email content and its recorded delivery outcome.</p></div><button type="button" onClick={() => setEmailPreview(null)} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Close</button></div>
        <dl className="grid gap-3 border-b border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2"><div><dt className="font-bold text-gray-600">To</dt><dd>{emailPreview.recipientEmail}</dd></div><div><dt className="font-bold text-gray-600">Reply to</dt><dd>{emailPreview.replyToEmail}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-gray-600">Subject</dt><dd>{emailPreview.subject}</dd></div><div><dt className="font-bold text-gray-600">Sent by</dt><dd>{emailPreview.senderName} · {emailPreview.senderEmail}</dd></div><div><dt className="font-bold text-gray-600">Delivery</dt><dd>{emailPreview.deliveryStatus} · {new Date(emailPreview.sentAt ?? emailPreview.createdAt).toLocaleString('en-AU')}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-gray-600">Attachments</dt><dd>{emailPreview.attachmentNames.join(', ') || 'None recorded'}</dd></div></dl>
        <iframe title={`Archived email ${emailPreview.subject}`} sandbox="" srcDoc={emailPreview.html} className="min-h-[28rem] flex-1 bg-white" />
      </div>
    </div> : null}
  </div>
}
