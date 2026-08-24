'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AdminRole, StaffAccount } from '@/lib/staffAccounts'
import { canAccessClientCrm } from '@/lib/clientCrmPolicy'
import AdminPageHeader from './AdminPageHeader'

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string; description: string }> = [
  { value: 'owner', label: 'Owner', description: 'Full access, including staff accounts.' },
  { value: 'manager', label: 'Manager', description: 'Operational and configuration access.' },
  { value: 'staff', label: 'Operations', description: 'Quotes, bookings, cleaners, and calendar work.' },
  { value: 'agent', label: 'Regional Agent', description: 'Assigned clients, regional quotes, bookings, and calendar work.' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only admin access.' },
]

type AccountDraft = {
  displayName: string
  email: string
  jobTitle: string
  phone: string
  role: AdminRole
  active: boolean
  password: string
  availabilityAssigneeId: string
}

function emptyDraft(): AccountDraft {
  return { displayName: '', email: '', jobTitle: '', phone: '', role: 'agent', active: true, password: '', availabilityAssigneeId: '' }
}

export default function StaffAccessAdmin() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [username, setUsername] = useState('')
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; city: string; active: boolean }>>([])

  async function loadAccounts() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/staff')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load staff accounts.')
      setAccounts(result.accounts as StaffAccount[])
      const availabilityResponse = await fetch('/api/admin/availability')
      if (availabilityResponse.ok) {
        const availabilityResult = await availabilityResponse.json()
        setProfiles((availabilityResult.config?.assignees ?? []).map((profile: { id: string; name: string; city: string; active: boolean }) => ({
          id: profile.id,
          name: profile.name,
          city: profile.city,
          active: profile.active,
        })))
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load staff accounts.' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadAccounts() }, [])

  function resetForm() {
    setUsername('')
    setDraft(emptyDraft())
    setEditingId(null)
  }

  function editAccount(account: StaffAccount) {
    setEditingId(account.id)
    setUsername(account.username)
    setDraft({ displayName: account.displayName, email: account.email, jobTitle: account.jobTitle, phone: account.phone, role: account.role, active: account.active, password: '', availabilityAssigneeId: account.availabilityAssigneeId ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function migrateProfiles() {
    setIsMigrating(true)
    setStatus({ type: 'idle', message: '' })
    try {
      const response = await fetch('/api/admin/staff/migrate', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to import availability agents.')
      setStatus({ type: 'success', message: `${result.migrated?.length ?? 0} availability agent profiles are now linked to Staff Access.` })
      await loadAccounts()
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to import availability agents.' })
    } finally {
      setIsMigrating(false)
    }
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setStatus({ type: 'idle', message: '' })
    try {
      const payload = editingId
        ? { id: editingId, ...draft, password: draft.password || undefined }
        : { username, ...draft }
      const response = await fetch('/api/admin/staff', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save staff account.')
      setStatus({ type: 'success', message: editingId ? 'Staff account updated.' : 'Staff account created.' })
      resetForm()
      await loadAccounts()
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save staff account.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <AdminPageHeader title="Team access" description="Create team logins, link regional agents to their service profile, and maintain the contact details used in client email signatures." />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5">
          <div>
            <h2 className="font-bold text-teal-900">Regional agent profiles</h2>
            <p className="mt-1 max-w-3xl text-sm text-teal-800">Import the existing Melbourne and NSW availability profiles once. Their schedules and service zones remain unchanged.</p>
          </div>
          <button type="button" onClick={() => void migrateProfiles()} disabled={isMigrating} className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{isMigrating ? 'Importing...' : 'Import availability agents'}</button>
        </div>

        <form onSubmit={saveAccount} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>{editingId ? 'Edit team account' : 'Create team account'}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {!editingId ? <div><label className="mb-1 block text-sm font-medium text-gray-700">Username</label><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. jane.smith" className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required /></div> : null}
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Display name</label><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Work email</label><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required={canAccessClientCrm(draft.role)} /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Position title</label><input value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} placeholder="e.g. Regional Agent" className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required={canAccessClientCrm(draft.role)} /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Work phone</label><input type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required={canAccessClientCrm(draft.role)} /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Role</label><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm">{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.description}</option>)}</select></div>
            {draft.role === 'agent' ? <div><label className="mb-1 block text-sm font-medium text-gray-700">Linked regional profile</label><select value={draft.availabilityAssigneeId} onChange={(event) => setDraft({ ...draft, availabilityAssigneeId: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required><option value="">Select a profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} ({profile.city}){profile.active ? '' : ' - inactive'}</option>)}</select><p className="mt-1 text-xs text-gray-500">This controls which quotes, bookings, and calendar the agent can access.</p></div> : null}
            <div><label className="mb-1 block text-sm font-medium text-gray-700">{editingId ? 'New password (optional)' : 'Password'}</label><input type="password" minLength={12} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" required={!editingId} autoComplete="new-password" /><p className="mt-1 text-xs text-gray-500">Use at least 12 characters.</p></div>
          </div>
          {canAccessClientCrm(draft.role) ? <div className="rounded-xl border border-teal-100 bg-teal-50 p-4"><div className="text-sm font-semibold text-teal-900">Client email signature preview</div><div className="mt-2 whitespace-pre-line text-sm leading-6 text-teal-950">{`Kind regards,\n\n${draft.displayName || 'Full name'}\n${draft.jobTitle || 'Position title'}\nSecure Cleaning Aus\n${draft.phone || 'Work phone'}\n${draft.email || 'Work email'}\nsecurecleaning.com.au\nABN 81 674 121 825`}</div><p className="mt-2 text-xs text-teal-800">The verified Secure Cleaning mailbox sends the email. Replies go directly to this work email.</p></div> : null}
          {editingId ? <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active account</label> : null}
          <div className="flex flex-wrap gap-3"><button type="submit" disabled={isSaving} className="rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#1fb56c' }}>{isSaving ? 'Saving...' : editingId ? 'Save account' : 'Create account'}</button>{editingId ? <button type="button" onClick={resetForm} className="rounded-lg border border-gray-200 px-5 py-3 font-semibold text-gray-700">Cancel</button> : null}</div>
          {status.message ? <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{status.message}</p> : null}
        </form>

        <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#1a2744' }}>Current team accounts</h2>
          {isLoading ? <p className="text-sm text-gray-600">Loading accounts...</p> : <div className="space-y-3">{accounts.map((account) => <div key={account.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between"><div><div className="font-semibold text-gray-900">{account.displayName}</div><div className="text-sm text-gray-600">{account.username}{account.email ? ` - ${account.email}` : ''}</div>{account.jobTitle || account.phone ? <div className="mt-1 text-sm text-gray-500">{[account.jobTitle, account.phone].filter(Boolean).join(' - ')}</div> : null}{canAccessClientCrm(account.role) && (!account.email || !account.jobTitle || !account.phone) ? <div className="mt-1 text-sm font-medium text-amber-700">Complete the signature profile before sending client emails.</div> : null}{account.role === 'agent' && account.availabilityAssigneeId ? <div className="mt-1 text-sm text-teal-700">Regional profile: {profiles.find((profile) => profile.id === account.availabilityAssigneeId)?.name ?? account.availabilityAssigneeId}</div> : null}</div><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-600">{account.role === 'staff' ? 'Operations' : account.role === 'agent' ? 'Regional Agent' : account.role}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${account.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{account.active ? 'Active' : 'Disabled'}</span>{account.role === 'agent' && account.availabilityAssigneeId ? <><Link href={`/admin/availability/quoters/${account.availabilityAssigneeId}`} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Edit schedule</Link><Link href={`/availability/quotes/${account.availabilityAssigneeId}`} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Open regional quotes</Link></> : null}<button type="button" onClick={() => editAccount(account)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Edit</button></div></div>)}</div>}
        </section>
    </div>
  )
}
