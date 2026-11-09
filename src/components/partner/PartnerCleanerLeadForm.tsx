'use client'
import { useRef, useState } from 'react'
import LocalityAutocomplete from '@/components/shared/LocalityAutocomplete'
import ActionToast from '@/components/ActionToast'
import type { City } from '@/lib/types'
import type { PartnerCleanerReceipt } from '@/lib/partnerCleanerPolicy'
import { defaultPartnerCity } from '@/lib/partnerPortalDefaults'

const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900'
const button = 'rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50'
const regions = { melbourne: 'Victoria', sydney: 'New South Wales', brisbane: 'Queensland' }
const blank = { businessName: '', firstName: '', lastName: '', email: '', phone: '', address: '', notes: '', suburb: '', postcode: '' }

export default function PartnerCleanerLeadForm({ cities, onBusyChange }: { cities: City[]; onBusyChange: (busy: boolean) => void }) {
  const [details, setDetails] = useState({ ...blank, city: defaultPartnerCity(cities) })
  const [consent, setConsent] = useState(false), [review, setReview] = useState(false), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [receipt, setReceipt] = useState<PartnerCleanerReceipt | null>(null)
  const key = useRef(''), submitting = useRef(false)
  async function submit() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); onBusyChange(true); setMessage('')
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const response = await fetch('/api/partner-booking/cleaners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, emailConsent: consent, welcomeEmailConsent: consent, idempotencyKey: key.current }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save the cleaner details.')
      setReceipt(result)
    } catch (error) { setMessage((error as Error).message) }
    finally { submitting.current = false; setBusy(false); onBusyChange(false) }
  }
  return <section className="rounded-xl border bg-white p-6" aria-label="Add cleaner lead">
    <ActionToast message={message} tone="error" onDismiss={() => setMessage('')} />
    {receipt ? <div role="status" className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
      <h2 className="text-xl font-bold">Cleaner details received</h2>
      <p>{receipt.emailStatus === 'sent' ? 'The cleaner lead has been saved and the details email has been sent. The cleaner can use its secure link to complete their profile.' : 'Secure Cleaning will review this submission and the email status. Do not enter it again or send another invitation.'}</p>
      {receipt.welcomeEmailStatus && receipt.welcomeEmailStatus !== 'not_required' && <p>{receipt.welcomeEmailStatus === 'sent' ? 'The separate introduction email has also been sent, signed by and copied to the priority agent for their state.' : 'The separate introduction email needs team review. Do not submit the cleaner again.'}</p>}
      <p className="break-all text-sm">Reference: {receipt.reference}</p>
      <button className={button} onClick={() => { setReceipt(null); setDetails({ ...blank, city: defaultPartnerCity(cities) }); setConsent(false); setReview(false); key.current = ''; setMessage('') }}>Add another cleaner</button>
    </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!details.suburb.trim() || !/^\d{4}$/.test(details.postcode)) { setMessage('Choose a suburb and postcode before reviewing.'); return } setMessage(''); setReview(true) }}>
      <div><h2 className="text-xl font-bold">Add cleaner lead</h2><p className="mt-1 text-gray-600">For cleaning companies interested in purchasing cleaning contracts. Enter their initial details; they can complete the rest using the secure link in their email.</p></div>
      <fieldset disabled={busy || review} className="space-y-4">
        <label className="block">Business name *<input required maxLength={160} className={field} value={details.businessName} onChange={e => setDetails({ ...details, businessName: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>First name (optional)<input maxLength={80} className={field} value={details.firstName} onChange={e => setDetails({ ...details, firstName: e.target.value })} /><span className="text-sm text-gray-500">Saved as Manager if unknown.</span></label>
          <label>Surname (optional)<input maxLength={80} className={field} value={details.lastName} onChange={e => setDetails({ ...details, lastName: e.target.value })} /></label>
          <label>Email *<input required type="email" maxLength={254} className={field} value={details.email} onChange={e => setDetails({ ...details, email: e.target.value })} /></label>
          <label>Phone *<input required type="tel" maxLength={40} className={field} value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value })} /></label>
        </div>
        <label className="block">Street address (optional)<input maxLength={240} autoComplete="street-address" className={field} value={details.address} onChange={e => setDetails({ ...details, address: e.target.value })} /></label>
        <label className="block max-w-sm">State *<select required className={field} value={details.city} onChange={e => setDetails({ ...details, city: e.target.value as City, suburb: '', postcode: '' })}><option value="">Choose state</option>{cities.map(city => <option key={city} value={city}>{regions[city]}</option>)}</select></label>
        <LocalityAutocomplete idPrefix="partner-cleaner" city={details.city || undefined} suburb={details.suburb} postcode={details.postcode} required onChange={updates => setDetails({ ...details, ...updates })} />
        <label className="block">Internal notes (optional)<textarea maxLength={1500} rows={3} className={field} value={details.notes} onChange={e => setDetails({ ...details, notes: e.target.value })} /><span className="text-sm text-gray-500">Visible to the Secure Cleaning team only. Not included in the cleaner email or profile form.</span></label>
      </fieldset>
      {!review ? <button className={button} disabled={busy || !cities.length}>Review cleaner details</button> : <div className="space-y-4 rounded-lg border border-teal-200 bg-teal-50 p-4">
        <h3 className="font-bold">Review before saving and sending</h3>
        <p className="break-words">{details.businessName}<br />{details.firstName || 'Manager'} {details.lastName}<br />{details.email} · {details.phone}<br />{details.address && <>{details.address}<br /></>}{details.suburb} {details.postcode}, {details.city && regions[details.city]}</p>
        <p>The email will thank them for the call and ask them to review their details, service areas, preferred work, machinery and documents. The link lasts 48 hours. They remain a lead until the team reviews them.</p>
        <p>A separate introduction email is sent using the saved New Cleaner First Email template, with the signature of the priority agent for their state. That agent receives a copy and replies go to them.</p>
        <p className="text-sm">If the email address is already recorded, the submission goes to the team for review. Existing details are not replaced and another email is not sent.</p>
        <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={consent} onChange={e => setConsent(e.target.checked)} />The cleaner agreed to have their details recorded and receive both the Secure Cleaning profile-completion and introduction emails, with the introduction copied to their state agent. I have checked their email address.</label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => { setReview(false); setConsent(false); key.current = '' }}>Edit details</button><button type="button" className={button} disabled={busy || !consent} onClick={() => void submit()}>{busy ? 'Saving and sending...' : 'Save cleaner & send emails'}</button></div>
      </div>}
    </form>}
  </section>
}
