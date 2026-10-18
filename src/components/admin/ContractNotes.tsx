'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Note = { id: string; text: string; author: string; createdAt: string }

export default function ContractNotes({ kind, recordId }: { kind: 'product' | 'sale'; recordId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [more, setMore] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef<{ id: string; text: string } | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(async (offset = 0, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/contract-notes?kind=${kind}&recordId=${encodeURIComponent(recordId)}&offset=${offset}`, { cache: 'no-store', signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load notes.')
      if (signal?.aborted) return
      setNotes((current) => offset ? [...current, ...result.notes.filter((note: Note) => !current.some((item) => item.id === note.id))] : result.notes)
      setMore(result.notes.length === 50)
      setMessage('')
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load notes.')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [kind, recordId])

  useEffect(() => {
    const controller = new AbortController()
    void load(0, controller.signal)
    return () => controller.abort()
  }, [load])

  async function save() {
    if (inFlight.current || !text.trim()) return
    inFlight.current = true
    setSaving(true)
    setMessage('')
    if (!pending.current || pending.current.text !== text.trim()) pending.current = { id: crypto.randomUUID(), text: text.trim() }
    try {
      const response = await fetch('/api/admin/contract-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId, text: pending.current.text, requestId: pending.current.id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save note.')
      setNotes((current) => [result.note, ...current.filter((note) => note.id !== result.note.id)])
      setText('')
      pending.current = null
      setMessage('Note saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save note. Your text has been kept; please try again.') }
    finally { inFlight.current = false; setSaving(false) }
  }

  return <div className="mt-4">
    <h4 className="font-semibold">Private notes</h4>
    <p className="mt-1 text-sm text-gray-600">Record cleaner conversations and follow-ups for this {kind}. Notes are internal and are not included in public listings, broadcasts or customer documents.</p>
    <label className="mt-4 block text-sm font-medium">Add a note<textarea rows={3} maxLength={5000} value={text} disabled={saving} onChange={(event) => setText(event.target.value)} placeholder="Spoke to a cleaner about..." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
    <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-gray-500">{text.length}/5,000 characters</span><button type="button" onClick={() => void save()} disabled={saving || loading || !text.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save note'}</button></div>
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    <div className="mt-4 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-gray-600"><strong>{note.author}</strong><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('en-AU')}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{note.text}</p></article>)}</div>
    {loading ? <p className="mt-3 text-sm text-gray-500">Loading notes...</p> : notes.length === 0 && !message ? <p className="mt-3 text-sm text-gray-500">No notes recorded yet.</p> : null}
    <button type="button" disabled={loading || saving} onClick={() => void load()} className="mt-3 text-sm font-semibold text-teal-700 disabled:opacity-50">Refresh notes</button>
    {more ? <button type="button" disabled={loading || saving} onClick={() => void load(notes.length)} className="ml-4 mt-3 text-sm font-semibold text-teal-700 disabled:opacity-50">Load older notes</button> : null}
  </div>
}
