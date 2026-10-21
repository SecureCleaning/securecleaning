'use client'

import { useMemo, useState } from 'react'
import { searchBroadcastCleaners, type BroadcastCleanerOption } from '@/lib/broadcastCleanerSearch'

export default function BroadcastCleanerPicker({ cleaners, selectedId, onChange, loading }: {
  cleaners: BroadcastCleanerOption[]; selectedId: string; onChange: (id: string) => void; loading: boolean
}) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => searchBroadcastCleaners(cleaners, query), [cleaners, query])
  const selected = cleaners.find((cleaner) => cleaner.id === selectedId)
  return <div className="sm:col-span-2">
    <label htmlFor="broadcast-cleaner-search" className="text-sm font-medium">Search cleaners by name, business or email</label>
    <input id="broadcast-cleaner-search" type="search" value={query} disabled={loading} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a name or email address" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
    <p className="my-2 text-xs text-gray-600" role="status">{loading ? 'Loading eligible cleaners...' : `${matches.length} of ${cleaners.length} eligible cleaners shown, sorted by name (A-Z).`}</p>
    {selected ? <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-teal-50 p-3 text-sm"><span>Selected: <strong>{selected.name}</strong> · {selected.email}</span><button type="button" onClick={() => onChange('')} className="font-semibold text-teal-800">Clear</button></div> : null}
    <fieldset disabled={loading} className="max-h-64 overflow-y-auto rounded-lg border border-gray-300 bg-white">
      <legend className="sr-only">Choose one cleaner</legend>
      {!loading && matches.length === 0 ? <p className="p-3 text-sm text-gray-500">No eligible cleaners match your search.</p> : null}
      {!loading ? matches.map((cleaner) => <label key={cleaner.id} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 p-3 text-sm last:border-0 hover:bg-gray-50">
        <input type="radio" name="broadcast-cleaner-choice" checked={selectedId === cleaner.id} onChange={() => onChange(cleaner.id)} className="mt-1" />
        <span className="min-w-0"><strong className="block">{cleaner.name}</strong>{cleaner.businessName && cleaner.businessName !== cleaner.name ? <span className="block text-gray-600">{cleaner.businessName}</span> : null}<span className="block break-all text-gray-600">{cleaner.email}</span></span>
      </label>) : null}
    </fieldset>
  </div>
}
