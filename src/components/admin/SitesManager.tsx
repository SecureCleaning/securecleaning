'use client'

import { useState } from 'react'
import type { City, PremisesType } from '@/lib/types'
import type { SiteRecord } from '@/lib/sites'

const cityOptions: City[] = ['melbourne', 'sydney']
const premisesOptions: PremisesType[] = ['office', 'medical', 'industrial', 'childcare', 'retail', 'gym', 'warehouse', 'other']

type SiteFormState = {
  siteName: string
  address: string
  suburb: string
  postcode: string
  city: City
  premisesType: PremisesType
  floorArea: string
  accessNotes: string
  alarmNotes: string
  inductionNotes: string
  keyholderName: string
  keyholderPhone: string
  isActive: boolean
}

function toFormState(site?: SiteRecord): SiteFormState {
  return {
    siteName: site?.site_name ?? '',
    address: site?.address ?? '',
    suburb: site?.suburb ?? '',
    postcode: site?.postcode ?? '',
    city: (site?.city ?? 'melbourne') as City,
    premisesType: (site?.premises_type ?? 'office') as PremisesType,
    floorArea: site?.floor_area ? String(site.floor_area) : '',
    accessNotes: site?.access_notes ?? '',
    alarmNotes: site?.alarm_notes ?? '',
    inductionNotes: site?.induction_notes ?? '',
    keyholderName: site?.keyholder_name ?? '',
    keyholderPhone: site?.keyholder_phone ?? '',
    isActive: site?.is_active ?? true,
  }
}

export default function SitesManager({ initialSites }: { initialSites: SiteRecord[] }) {
  const [sites, setSites] = useState<SiteRecord[]>(initialSites)
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [form, setForm] = useState<SiteFormState>(toFormState())
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function startCreate() {
    setEditingSiteId(null)
    setForm(toFormState())
    setStatus(null)
    setError(null)
  }

  function startEdit(site: SiteRecord) {
    setEditingSiteId(site.id)
    setForm(toFormState(site))
    setStatus(null)
    setError(null)
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setStatus(null)
    setError(null)

    try {
      const payload = {
        siteName: form.siteName,
        address: form.address,
        suburb: form.suburb,
        postcode: form.postcode,
        city: form.city,
        premisesType: form.premisesType,
        floorArea: form.floorArea ? Number(form.floorArea) : null,
        accessNotes: form.accessNotes,
        alarmNotes: form.alarmNotes,
        inductionNotes: form.inductionNotes,
        keyholderName: form.keyholderName,
        keyholderPhone: form.keyholderPhone,
        isActive: form.isActive,
      }

      const response = await fetch('/api/admin/sites', {
        method: editingSiteId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSiteId ? { ...payload, siteId: editingSiteId } : payload),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save site.')
      }

      const savedSite = result.site as SiteRecord
      setSites((current) => {
        if (editingSiteId) {
          return current.map((site) => (site.id === editingSiteId ? savedSite : site))
        }
        return [savedSite, ...current]
      })
      setEditingSiteId(savedSite.id)
      setStatus(editingSiteId ? 'Site updated.' : 'Site created.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save site.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Sites</h2>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: '#1a2744' }}
          >
            New Site
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => startEdit(site)}
              className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-gray-900">{site.site_name || site.address}</div>
                  <div className="text-sm text-gray-600 mt-1">{site.address}</div>
                  <div className="text-xs text-gray-500 mt-1 capitalize">
                    {site.city} · {site.premises_type ?? 'unspecified'}
                  </div>
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded-full ${site.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {site.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            </button>
          ))}
          {sites.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">No sites yet.</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#1a2744' }}>
          {editingSiteId ? 'Edit Site' : 'Create Site'}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          <input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} placeholder="Site name" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" required className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} placeholder="Suburb" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
            <input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} placeholder="Postcode" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value as City })} className="rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <select value={form.premisesType} onChange={(e) => setForm({ ...form, premisesType: e.target.value as PremisesType })} className="rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
              {premisesOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <input value={form.floorArea} onChange={(e) => setForm({ ...form, floorArea: e.target.value })} placeholder="Floor area" type="number" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <textarea value={form.accessNotes} onChange={(e) => setForm({ ...form, accessNotes: e.target.value })} placeholder="Access notes" rows={2} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <textarea value={form.alarmNotes} onChange={(e) => setForm({ ...form, alarmNotes: e.target.value })} placeholder="Alarm notes" rows={2} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <textarea value={form.inductionNotes} onChange={(e) => setForm({ ...form, inductionNotes: e.target.value })} placeholder="Induction notes" rows={2} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.keyholderName} onChange={(e) => setForm({ ...form, keyholderName: e.target.value })} placeholder="Keyholder name" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
            <input value={form.keyholderPhone} onChange={(e) => setForm({ ...form, keyholderPhone: e.target.value })} placeholder="Keyholder phone" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active site
          </label>

          {status ? <div className="text-sm text-green-600">{status}</div> : null}
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button type="submit" disabled={isSaving} className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#22c55e' }}>
            {isSaving ? 'Saving…' : editingSiteId ? 'Update Site' : 'Create Site'}
          </button>
        </form>
      </div>
    </div>
  )
}
