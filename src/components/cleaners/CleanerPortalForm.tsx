'use client'

import { useState } from 'react'
import { AUSTRALIAN_STATES, CLEANER_PORTAL_SERVICES, type CleanerPortalProfile } from '@/lib/cleanerPortalPolicy'

type Notice = { type: 'success' | 'error'; message: string } | null

function emptyProfile(email: string): CleanerPortalProfile {
  return { businessName: '', firstName: '', lastName: '', email, phone: '', alternatePhone: '', address: '', suburb: '', postcode: '', city: '', state: '', abn: '', services: [], serviceAreas: [], preferredWork: '', insuranceExpiry: '', policeCheckExpiry: '', inductionExpiry: '', workingWithChildrenCheck: false, status: 'new' }
}

export default function CleanerPortalForm({ mode, registeredEmail, initialProfile }: { mode: 'update' | 'onboarding'; registeredEmail: string; initialProfile: CleanerPortalProfile | null }) {
  const [profile, setProfile] = useState(initialProfile ?? emptyProfile(registeredEmail))
  const [saved, setSaved] = useState(mode === 'update')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('other')
  const [documentExpiry, setDocumentExpiry] = useState('')
  const [documentNotes, setDocumentNotes] = useState('')

  function field(key: keyof CleanerPortalProfile, label: string, options?: { type?: string; required?: boolean; wide?: boolean; readOnly?: boolean }) {
    return <label className={`text-sm ${options?.wide ? 'sm:col-span-2' : ''}`}><span className="mb-1 block font-semibold text-gray-700">{label}{options?.required ? ' *' : ''}</span><input type={options?.type ?? 'text'} required={options?.required} readOnly={options?.readOnly} value={String(profile[key] ?? '')} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 read-only:bg-gray-100" /></label>
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/cleaner-portal/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your details.')
      setProfile(result.profile as CleanerPortalProfile); setSaved(true)
      setNotice({ type: 'success', message: result.created ? 'Registration submitted for approval. The regional agent and owner have been notified.' : 'Your cleaner details have been updated.' })
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save your details.' }) }
    finally { setBusy(false) }
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true); setNotice(null)
    try {
      const data = new FormData(); data.set('file', file); data.set('documentType', documentType); data.set('expiryDate', documentExpiry); data.set('notes', documentNotes)
      const response = await fetch('/api/cleaner-portal/documents', { method: 'POST', body: data })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload document.')
      setFile(null); setDocumentExpiry(''); setDocumentNotes('')
      setNotice({ type: 'success', message: 'Document uploaded securely for the Secure Cleaning team.' })
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to upload document.' }) }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14"><header className="mb-6"><p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Secure cleaner portal</p><h1 className="mt-2 text-3xl font-bold text-[#1a2744]">{mode === 'onboarding' && !saved ? 'Complete your cleaner registration' : 'Review your cleaner details'}</h1><p className="mt-2 text-gray-600">Your registered email is the identity for this private link. Internal staff notes and approval controls are not available here.</p></header>
    {notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className={`mb-5 rounded-xl border p-4 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-green-200 bg-green-50 text-green-900'}`}>{notice.message}</div> : null}
    <form onSubmit={save} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"><div className="grid gap-4 sm:grid-cols-2">{field('businessName', 'Business name', { required: true })}{field('abn', 'ABN')}{field('firstName', 'First name', { required: true })}{field('lastName', 'Surname', { required: true })}{field('email', 'Registered email', { type: 'email', readOnly: true })}{field('phone', 'Phone')}{field('alternatePhone', 'Alternate phone')}{field('address', 'Street address')}{field('suburb', 'Suburb')}{field('postcode', 'Postcode')}{field('city', 'City')}<label className="text-sm"><span className="mb-1 block font-semibold text-gray-700">State or territory *</span><select required value={profile.state} onChange={(event) => setProfile({ ...profile, state: event.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select state</option>{AUSTRALIAN_STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
      <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-gray-700">Services provided</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{CLEANER_PORTAL_SERVICES.map((service) => <label key={service} className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm"><input type="checkbox" checked={profile.services.includes(service)} onChange={(event) => setProfile({ ...profile, services: event.target.checked ? [...profile.services, service] : profile.services.filter((item) => item !== service) })} />{service}</label>)}</div></fieldset>
      <label className="text-sm sm:col-span-2"><span className="mb-1 block font-semibold text-gray-700">Service areas</span><textarea rows={3} value={profile.serviceAreas.join(', ')} onChange={(event) => setProfile({ ...profile, serviceAreas: event.target.value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean) })} placeholder="Suburbs, postcodes or areas, separated by commas" className="w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <label className="text-sm sm:col-span-2"><span className="mb-1 block font-semibold text-gray-700">Preferred work or availability</span><textarea rows={3} maxLength={800} value={profile.preferredWork} onChange={(event) => setProfile({ ...profile, preferredWork: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      {field('insuranceExpiry', 'Insurance expiry', { type: 'date' })}{field('policeCheckExpiry', 'Police check expiry', { type: 'date' })}{field('inductionExpiry', 'Induction expiry', { type: 'date' })}<label className="flex items-center gap-3 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={profile.workingWithChildrenCheck} onChange={(event) => setProfile({ ...profile, workingWithChildrenCheck: event.target.checked })} />Working with Children Check held</label></div>
      {saved && profile.status === 'pending_approval' ? <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Approval pending. An authorised regional agent or owner must approve this profile before it can receive contract opportunities.</p> : null}
      <button disabled={busy} className="mt-6 rounded-lg bg-teal-700 px-6 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : mode === 'onboarding' && !saved ? 'Submit registration for approval' : 'Save details'}</button></form>
    <form onSubmit={upload} className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-bold text-[#1a2744]">Upload forms and compliance documents</h2><p className="mt-1 text-sm text-gray-600">PDF, JPG, PNG or WebP, up to 10 MB. New applicants must submit their profile before uploading documents.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Document type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="insurance">Insurance</option><option value="police_check">Police check</option><option value="induction">Induction</option><option value="contract">Contract or form</option><option value="other">Other</option></select></label><label className="text-sm font-semibold">Expiry date (if applicable)<input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-semibold sm:col-span-2">File<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-semibold sm:col-span-2">Notes<textarea rows={2} maxLength={500} value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><button disabled={busy || !saved || !file} className="mt-5 rounded-lg border border-teal-700 px-5 py-2.5 font-semibold text-teal-800 disabled:opacity-40">Upload document</button></form>
  </div>
}
