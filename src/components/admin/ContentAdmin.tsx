'use client'

import { useMemo, useState } from 'react'
import type { SiteContentRow } from '@/lib/content'
import AdminGate from './AdminGate'

export default function ContentAdmin({ initialEntries }: { initialEntries: SiteContentRow[] }) {
  const [entries, setEntries] = useState<SiteContentRow[]>(initialEntries)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialEntries.map((entry) => [entry.key, entry.content]))
  )
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const groupedEntries = useMemo(() => {
    return entries.reduce<Record<string, SiteContentRow[]>>((acc, entry) => {
      if (!acc[entry.group_name]) {
        acc[entry.group_name] = []
      }
      acc[entry.group_name].push(entry)
      return acc
    }, {})
  }, [entries])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const payload = entries.map((entry) => ({
        key: entry.key,
        title: entry.title,
        group_name: entry.group_name,
        content: values[entry.key] ?? '',
      }))

      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries: payload }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Save failed.')
      }

      const nextEntries = result.entries as SiteContentRow[]
      setEntries(nextEntries)
      setValues(Object.fromEntries(nextEntries.map((entry) => [entry.key, entry.content])))
      setStatus({ type: 'success', message: 'Content saved successfully.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save content.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Content Editor
          </h1>
          <p className="text-gray-600 max-w-2xl">
            Small internal editor for updating key website copy without touching code. Changes save to Supabase and the live pages fall back safely if the database is unavailable.
          </p>
        </div>

        <AdminGate
          title="Unlock editor"
          description="Enter the internal content password to manage editable site copy."
        >
          <form onSubmit={handleSave} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Editable website copy</h2>
                <p className="text-sm text-gray-600">Grouped by section for quick updates.</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: '#22c55e' }}
              >
                {isSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

            {Object.entries(groupedEntries).map(([groupName, groupEntries]) => (
              <section key={groupName} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-xl font-bold capitalize mb-5" style={{ color: '#1a2744' }}>
                  {groupName}
                </h3>
                <div className="space-y-5">
                  {groupEntries.map((entry) => (
                    <div key={entry.key}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                        <label htmlFor={entry.key} className="font-semibold text-gray-900">
                          {entry.title}
                        </label>
                        <span className="text-xs text-gray-500">{entry.key}</span>
                      </div>
                      <textarea
                        id={entry.key}
                        rows={entry.content.length > 120 ? 5 : 3}
                        value={values[entry.key] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [entry.key]: event.target.value,
                          }))
                        }
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {status.message ? (
              <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {status.message}
              </p>
            ) : null}
          </form>
        </AdminGate>
      </div>
    </div>
  )
}
