'use client'

import { useEffect, useMemo, useState } from 'react'
import RichEmailEditor from '@/components/admin/RichEmailComposer'
import EmailPreviewModal from '@/components/admin/EmailPreviewModal'
import { createRichEmailContent } from '@/lib/richEmailContent'
import { INSPECTION_EMAIL_MERGE_FIELDS } from '@/lib/emailMergeFields'
import type { ContractProduct } from '@/lib/contractProducts'
import type { ContractSale, ContractSaleInspectionTemplate } from '@/lib/contractSales'
import type { ContractSaleChecklistData } from '@/lib/contractSaleChecklistPdf'

type EmailDraft = { subject: string; bodyText: string; bodyHtml: string; bodyDocument?: Record<string, unknown> | null }
type Preview = { to: string; from: string; subject: string; html: string; bodyText: string; bodyHtml: string; fingerprint: string }

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function appointmentParts(value: string, timeZone: string) {
  if (!value) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const item = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { date: `${item.year}-${item.month}-${item.day}`, time: `${item.hour}:${item.minute}` }
}

function scopeSummary(product: ContractProduct | null) {
  if (!product) return ''
  return product.cleanerScopeSnapshot.rooms.map((room) => `${room.label} x ${room.quantity}: ${room.tasks.map((task) => typeof task === 'string' ? task : task.label).join(', ')}`).join('\n')
}

function defaultChecklist(sale: ContractSale, product: ContractProduct | null): ContractSaleChecklistData {
  const inspectionDate = sale.inspection ? appointmentParts(sale.inspection.startsAt, sale.inspection.timeZone)?.date ?? '' : ''
  return {
    inspectionDate, commencementDate: sale.commencementDate || product?.startDate || '',
    clientBusiness: sale.clientBusiness, clientContact: sale.clientName, clientPhone: sale.clientPhone, clientEmail: sale.clientEmail,
    cleanerBusiness: sale.cleanerBusiness, cleanerContact: sale.cleanerName, cleanerPhone: sale.cleanerPhone, cleanerEmail: sale.cleanerEmail,
    siteName: sale.siteName || sale.clientBusiness, siteAddress: sale.siteAddress, cleaningDays: '', cleaningTime: product?.timePreference ?? '',
    frequency: product?.frequency ?? '', scopeSummary: scopeSummary(product), initialClean: '', accessHours: '',
    accessInstructions: sale.siteAccessNotes, inductionRequirements: sale.siteInductionNotes, alarmSecurity: sale.siteAlarmNotes,
    keyholderDetails: [sale.siteKeyholderName, sale.siteKeyholderPhone].filter(Boolean).join(' - '), lightSwitches: '', cleanerStorage: '',
    consumables: '', waterAccess: '', rubbishDisposal: '', cleanerBook: '', hazards: '', equipment: '', keysItemsHandedOver: '', notes: '',
  }
}

function templateDrafts(template: ContractSaleInspectionTemplate) {
  return {
    availability: { subject: template.availabilitySubject, bodyText: template.availabilityBodyText, bodyHtml: template.availabilityBodyHtml, bodyDocument: template.availabilityBodyDocument },
    client: { subject: template.clientSubject, bodyText: template.clientBodyText, bodyHtml: template.clientBodyHtml, bodyDocument: template.clientBodyDocument },
    cleaner: { subject: template.cleanerSubject, bodyText: template.cleanerBodyText, bodyHtml: template.cleanerBodyHtml, bodyDocument: template.cleanerBodyDocument },
  }
}

export default function ContractSaleInspectionPanel({ sale, product, template, actorRole, onRefresh }: {
  sale: ContractSale
  product: ContractProduct | null
  template: ContractSaleInspectionTemplate
  actorRole: string
  onRefresh: () => Promise<void>
}) {
  const savedParts = sale.inspection ? appointmentParts(sale.inspection.startsAt, sale.inspection.timeZone) : null
  const [appointment, setAppointment] = useState({ date: savedParts?.date ?? '', time: savedParts?.time ?? '10:00', durationMinutes: String(sale.inspection?.durationMinutes ?? 60), location: sale.inspection?.location || sale.siteAddress, notes: sale.inspection?.notes ?? '' })
  const [drafts, setDrafts] = useState(() => templateDrafts(template))
  const [availabilityPreview, setAvailabilityPreview] = useState<Preview | null>(null)
  const [confirmationPreview, setConfirmationPreview] = useState<{ client: Preview; cleaner: Preview; fingerprint: string } | null>(null)
  const [availabilityRequestId, setAvailabilityRequestId] = useState(() => crypto.randomUUID())
  const [confirmationRequestIds, setConfirmationRequestIds] = useState(() => ({ client: crypto.randomUUID(), cleaner: crypto.randomUUID() }))
  const [checklist, setChecklist] = useState<ContractSaleChecklistData>(() => sale.checklist?.data ?? defaultChecklist(sale, product))
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const parts = sale.inspection ? appointmentParts(sale.inspection.startsAt, sale.inspection.timeZone) : null
    setAppointment({ date: parts?.date ?? '', time: parts?.time ?? '10:00', durationMinutes: String(sale.inspection?.durationMinutes ?? 60), location: sale.inspection?.location || sale.siteAddress, notes: sale.inspection?.notes ?? '' })
    setDrafts(templateDrafts(template)); setAvailabilityPreview(null); setConfirmationPreview(null)
    setChecklist(sale.checklist?.data ?? defaultChecklist(sale, product))
  }, [sale, product, template])

  const primaryInvoice = sale.invoices.find((invoice) => invoice.invoiceType === 'sale' && invoice.status !== 'void')
    ?? sale.invoices.find((invoice) => invoice.invoiceType === 'deposit' && invoice.status !== 'void')
  const depositConfirmed = Boolean(primaryInvoice && (primaryInvoice.invoiceType === 'sale'
    ? primaryInvoice.paidCents >= primaryInvoice.depositRequiredIncGstCents : primaryInvoice.status === 'paid'))
  const agreementSigned = sale.agreement?.status === 'signed'
  const canSchedule = depositConfirmed && agreementSigned

  function appointmentChanged(next: typeof appointment) { setAppointment(next); setConfirmationPreview(null) }
  function draftChanged(kind: keyof typeof drafts, value: EmailDraft) {
    setDrafts((current) => ({ ...current, [kind]: value }))
    if (kind === 'availability') setAvailabilityPreview(null); else setConfirmationPreview(null)
  }

  async function post(action: string, payload: Record<string, unknown>) {
    setBusy(action); setMessage('')
    try {
      const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, saleId: sale.id, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to complete this inspection action.')
      return result.result
    } finally { setBusy('') }
  }

  function emailPayload(kind: 'availability' | 'client' | 'cleaner') {
    return { ...appointment, [`${kind}Subject`]: drafts[kind].subject, [`${kind}BodyText`]: drafts[kind].bodyText, [`${kind}BodyHtml`]: drafts[kind].bodyHtml, [`${kind}BodyDocument`]: drafts[kind].bodyDocument }
  }

  async function previewAvailability() {
    try { setAvailabilityPreview(await post('inspection-email.preview', { kind: 'availability', ...emailPayload('availability') })) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview the availability request.') }
  }

  async function sendAvailability() {
    if (!availabilityPreview) return
    try {
      await post('inspection-availability.send', { ...emailPayload('availability'), previewFingerprint: availabilityPreview.fingerprint, requestId: availabilityRequestId })
      setMessage('Client availability request sent.'); setAvailabilityPreview(null); setAvailabilityRequestId(crypto.randomUUID()); await onRefresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send the availability request.') }
  }

  async function previewConfirmations() {
    try {
      setConfirmationPreview(await post('inspection-confirmations.preview', { ...appointment, ...emailPayload('client'), ...emailPayload('cleaner') }))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview the confirmation emails.') }
  }

  async function schedule() {
    if (!confirmationPreview) return
    try {
      await post('inspection.schedule', { ...appointment, ...emailPayload('client'), ...emailPayload('cleaner'), previewFingerprint: confirmationPreview.fingerprint, clientRequestId: confirmationRequestIds.client, cleanerRequestId: confirmationRequestIds.cleaner })
      setMessage('Inspection scheduled. Separate client and cleaner confirmations were sent, and the staff calendar was updated or supplied with an email fallback.')
      setConfirmationPreview(null); setConfirmationRequestIds({ client: crypto.randomUUID(), cleaner: crypto.randomUUID() }); await onRefresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to schedule the inspection.') }
  }

  async function saveDefaults() {
    try {
      await post('inspection-template.update', {
        availabilitySubject: drafts.availability.subject, availabilityBodyText: drafts.availability.bodyText, availabilityBodyHtml: drafts.availability.bodyHtml, availabilityBodyDocument: drafts.availability.bodyDocument,
        clientSubject: drafts.client.subject, clientBodyText: drafts.client.bodyText, clientBodyHtml: drafts.client.bodyHtml, clientBodyDocument: drafts.client.bodyDocument,
        cleanerSubject: drafts.cleaner.subject, cleanerBodyText: drafts.cleaner.bodyText, cleanerBodyHtml: drafts.cleaner.bodyHtml, cleanerBodyDocument: drafts.cleaner.bodyDocument,
      })
      setMessage('Inspection email defaults saved.'); await onRefresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save inspection email defaults.') }
  }

  async function saveChecklist() {
    try { await post('inspection-checklist.save', { checklist }); setMessage('Site checklist saved.'); await onRefresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save the site checklist.') }
  }

  async function uploadChecklist(file: File | null) {
    if (!file) return
    setBusy('checklist.upload'); setMessage('')
    try {
      const form = new FormData(); form.set('saleId', sale.id); form.set('file', file)
      const response = await fetch('/api/admin/contract-sales/checklists', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload the completed checklist.')
      setMessage('Completed checklist copy uploaded.'); await onRefresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to upload the completed checklist.') }
    finally { setBusy('') }
  }

  const checklistFields = useMemo(() => [
    ['inspectionDate','Inspection date','date'], ['commencementDate','Commencement date','date'], ['clientBusiness','Client business'], ['clientContact','Client contact'],
    ['clientPhone','Client phone'], ['clientEmail','Client email'], ['cleanerBusiness','Cleaner business'], ['cleanerContact','Cleaner contact'], ['cleanerPhone','Cleaner phone'],
    ['cleanerEmail','Cleaner email'], ['siteName','Site name'], ['siteAddress','Site address'], ['cleaningDays','Cleaning days'], ['cleaningTime','Cleaning time'], ['frequency','Frequency'],
    ['scopeSummary','Scope summary','textarea'], ['initialClean','Initial / spring clean','textarea'], ['accessHours','Access hours','textarea'], ['accessInstructions','Access instructions','textarea'],
    ['inductionRequirements','Induction requirements','textarea'], ['alarmSecurity','Alarm / security','textarea'], ['keyholderDetails','Keyholder details','textarea'],
    ['lightSwitches','Light switches / shutdown','textarea'], ['cleanerStorage','Cleaner storage','textarea'], ['consumables','Consumables','textarea'], ['waterAccess','Water access','textarea'],
    ['rubbishDisposal','Rubbish / recycling','textarea'], ['cleanerBook','Cleaner communication book','textarea'], ['hazards','Hazards','textarea'], ['equipment','Equipment','textarea'],
    ['keysItemsHandedOver','Keys / items handed over','textarea'], ['notes','Additional notes','textarea'],
  ] as const, [])

  return <div className="space-y-5">
    {message ? <p role="status" className="rounded-lg border border-gray-200 bg-white p-3 text-sm">{message}</p> : null}
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold">1. Ask the client for availability</h3>
      <p className="mt-1 text-sm text-gray-600">Optional. Use this after a phone call or whenever a written request is useful. It does not book an appointment.</p>
      <label className="mt-4 block text-sm font-medium">Client subject<input value={drafts.availability.subject} onChange={(event) => draftChanged('availability', { ...drafts.availability, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <div className="mt-4"><RichEmailEditor label="Client availability request" value={createRichEmailContent({ text: drafts.availability.bodyText, html: drafts.availability.bodyHtml, document: drafts.availability.bodyDocument })} resetKey={`inspection-availability-${sale.id}-${template.updatedAt}`} mergeFields={INSPECTION_EMAIL_MERGE_FIELDS} disabled={Boolean(busy)} onChange={(value) => draftChanged('availability', { ...drafts.availability, bodyText: value.text, bodyHtml: value.html, bodyDocument: value.document })} /></div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void previewAvailability()} disabled={Boolean(busy)} className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Preview availability request</button>{['owner','manager'].includes(actorRole) ? <button type="button" onClick={() => void saveDefaults()} disabled={Boolean(busy)} className="rounded-lg border border-teal-600 px-4 py-2 font-semibold text-teal-800 disabled:opacity-50">Save all three as defaults</button> : null}</div>
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold">2. Confirm the appointment</h3>
      <p className="mt-1 text-sm text-gray-600">The chosen time overrides normal appointment availability. A known conflict may be reviewed, but does not prevent an owner or assigned agent from scheduling.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Date<input type="date" value={appointment.date} onChange={(event) => appointmentChanged({ ...appointment, date: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Time<input type="time" value={appointment.time} onChange={(event) => appointmentChanged({ ...appointment, time: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Duration minutes<input type="number" min="15" max="480" value={appointment.durationMinutes} onChange={(event) => appointmentChanged({ ...appointment, durationMinutes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Location<input value={appointment.location} onChange={(event) => appointmentChanged({ ...appointment, location: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <label className="text-sm font-medium md:col-span-2">Internal inspection notes<textarea rows={3} value={appointment.notes} onChange={(event) => appointmentChanged({ ...appointment, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      </div>
      {!canSchedule ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Before confirmations can be sent: {agreementSigned ? '' : 'upload the signed agreement'}{!agreementSigned && !depositConfirmed ? ' and ' : ''}{depositConfirmed ? '' : 'confirm the cleared deposit'}.</p> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {(['client','cleaner'] as const).map((kind) => <div key={kind} className="rounded-xl border border-gray-200 p-4"><h4 className="font-bold capitalize">{kind} confirmation</h4><label className="mt-3 block text-sm font-medium">Subject<input value={drafts[kind].subject} onChange={(event) => draftChanged(kind, { ...drafts[kind], subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><div className="mt-3"><RichEmailEditor label={`${kind === 'client' ? 'Client' : 'Cleaner'} message`} value={createRichEmailContent({ text: drafts[kind].bodyText, html: drafts[kind].bodyHtml, document: drafts[kind].bodyDocument })} resetKey={`inspection-${kind}-${sale.id}-${template.updatedAt}`} mergeFields={INSPECTION_EMAIL_MERGE_FIELDS} disabled={Boolean(busy)} minHeight={220} onChange={(value) => draftChanged(kind, { ...drafts[kind], bodyText: value.text, bodyHtml: value.html, bodyDocument: value.document })} /></div></div>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void previewConfirmations()} disabled={Boolean(busy) || !appointment.date || !appointment.time || !appointment.location} className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Preview both confirmations</button><button type="button" onClick={() => void schedule()} disabled={Boolean(busy) || !canSchedule || !confirmationPreview} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Schedule &amp; send separate invites</button></div>
      {confirmationPreview ? <div className="mt-5 grid gap-5 xl:grid-cols-2">{(['client','cleaner'] as const).map((kind) => <div key={kind} className="overflow-hidden rounded-xl border border-teal-200"><div className="bg-teal-50 p-3 text-sm"><strong className="capitalize">{kind}</strong><br />To: {confirmationPreview[kind].to}<br />Subject: {confirmationPreview[kind].subject}</div><iframe title={`${kind} inspection email preview`} sandbox="" srcDoc={confirmationPreview[kind].html} className="h-96 w-full bg-white" /></div>)}</div> : null}
      {sale.inspection ? <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm"><strong>Scheduled:</strong> {new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: sale.inspection.timeZone }).format(new Date(sale.inspection.startsAt))}<br /><strong>Email invitations:</strong> {sale.inspection.inviteStatus}<br /><strong>Sender calendar:</strong> {sale.inspection.calendarStatus}{sale.inspection.calendarError ? ` - ${sale.inspection.calendarError}` : ''}</div> : null}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold">3. New site checklist</h3><p className="mt-1 text-sm text-gray-600">Review the pre-filled details, save, then open the A4 checklist for printing and handwritten site notes.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{checklistFields.map(([key,label,kind]) => <label key={key} className={`text-sm font-medium ${kind === 'textarea' ? 'md:col-span-2' : ''}`}>{label}{kind === 'textarea' ? <textarea rows={key === 'scopeSummary' || key === 'notes' ? 5 : 3} value={checklist[key]} onChange={(event) => setChecklist({ ...checklist, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /> : <input type={kind === 'date' ? 'date' : 'text'} value={checklist[key]} onChange={(event) => setChecklist({ ...checklist, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" />}</label>)}</div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveChecklist()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save checklist</button>{sale.checklist ? <a href={`/api/admin/contract-sales/checklists?saleId=${sale.id}&preview=1`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-300 px-4 py-2 font-semibold">Please print checklist</a> : <span className="self-center text-sm text-gray-500">Save before printing.</span>}</div>
      {sale.handoverAt ? <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4"><h4 className="font-bold text-green-900">Completed checklist copy</h4><p className="mt-1 text-sm text-green-800">Upload a photo, PNG or PDF after handover. Files remain private against this product sale.</p><label className="mt-3 inline-flex cursor-pointer rounded-lg bg-green-700 px-4 py-2 font-semibold text-white">Upload completed checklist<input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => void uploadChecklist(event.target.files?.[0] ?? null)} /></label>{sale.checklist?.uploads.map((upload) => <a key={upload.id} href={`/api/admin/contract-sales/checklists?saleId=${sale.id}&uploadId=${upload.id}&preview=1`} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-semibold text-green-800">View {upload.fileName}</a>)}</div> : <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">The completed checklist upload becomes available after operational handover.</p>}
    </section>

    {sale.inspection?.status === 'scheduled' ? <button type="button" onClick={async () => { try { await post('inspection.complete', { notes: appointment.notes }); setMessage('Inspection marked complete.'); await onRefresh() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to complete the inspection.') } }} disabled={Boolean(busy)} className="rounded-lg border border-green-600 px-4 py-2 font-semibold text-green-700 disabled:opacity-50">Mark inspection completed</button> : null}

    <EmailPreviewModal open={Boolean(availabilityPreview)} title="Client availability request preview" subject={availabilityPreview?.subject ?? ''} from={availabilityPreview?.from} to={availabilityPreview?.to} html={availabilityPreview?.html ?? ''} sending={busy === 'inspection-availability.send'} onClose={() => setAvailabilityPreview(null)} onSend={() => void sendAvailability()} sendLabel="Send availability request" />
  </div>
}
