'use client'
import { useEffect, useRef, useState } from 'react'
import type { CleanerRecord } from '@/lib/cleaners'
import { cleanerReviewLabels, prepareCleanerReview, reviewValue, type CleanerMatch, type ReviewChoice } from '@/lib/cleanerDuplicateReview'

export default function CleanerDuplicateReview<T extends object>({ matches, incoming, apiBase, headers, toForm, onPrepared, onSeparate, onCancel }: {
  matches: CleanerMatch[]; incoming: T; apiBase: string; headers?: HeadersInit; toForm: (record: CleanerRecord) => T;
  onPrepared: (id: string, form: T, version: string | null | undefined) => Promise<void>; onSeparate: () => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<{ record: CleanerRecord; form: T } | null>(null)
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  async function choose(id: string) {
    setBusy(true); setError(''); setSelected(null); setChoices({})
    try {
      const response = await fetch(`${apiBase}/${id}`, { headers }); const data = await response.json()
      if (!response.ok || !data.cleaner) throw new Error(data.error || 'Unable to load cleaner.')
      setSelected({ record: data.cleaner, form: toForm(data.cleaner) })
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load cleaner.') } finally { setBusy(false) }
  }
  const preview = selected ? prepareCleanerReview(selected.form, incoming, choices) : null
  const notesTooLong = preview ? reviewValue((preview as Record<string, unknown>).notes).length > 2000 : false
  return <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }} className="w-[95vw] max-w-5xl rounded-2xl p-0 backdrop:bg-black/50" aria-labelledby="cleaner-review-title">
    <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
      <h2 id="cleaner-review-title" className="text-xl font-bold text-slate-900">Possible existing cleaner</h2>
      <p className="mt-2 text-sm text-gray-600">Compare the details before saving. The existing cleaner keeps their documents, sales and email history. Nothing is changed until you save the prepared record.</p>
      <div className="my-4 flex flex-wrap gap-2">{matches.map(match => <button disabled={busy} key={match.id} type="button" onClick={() => void choose(match.id)} className={`rounded-lg border p-3 text-left text-sm ${selected?.record.id === match.id ? 'border-teal-600 bg-teal-50' : 'border-gray-300'}`}><strong>{match.name}</strong><br />{match.email}<br />{match.phone}<br /><span className="text-teal-700">Matches: {match.reasons.join(', ')}</span></button>)}</div>
      {selected ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Detail</th><th className="p-2">Already on file</th><th className="p-2">New entry</th><th className="p-2">Keep</th></tr></thead><tbody>{Object.entries(cleanerReviewLabels).map(([key,label]) => {
        const oldValue = reviewValue((selected.form as Record<string, unknown>)[key]), newValue = reviewValue((incoming as Record<string, unknown>)[key])
        if (!oldValue && !newValue) return null
        return <tr key={key} className="border-t align-top"><th className="p-2 font-medium">{label}</th><td className="max-w-xs whitespace-pre-wrap break-words p-2">{oldValue || 'Not supplied'}</td><td className="max-w-xs whitespace-pre-wrap break-words p-2">{newValue || 'Not supplied'}</td><td className="p-2">{oldValue === newValue ? 'Same' : !newValue ? 'Existing' : key === 'notes' ? 'Append new notes' : <select aria-label={`Keep ${label}`} value={choices[key] ?? 'existing'} onChange={e => setChoices(current => ({ ...current, [key]: e.target.value as ReviewChoice }))} className="rounded border p-2"><option value="existing">Existing only</option><option value="incoming">Use new; retain old in notes</option><option value="both">Existing; add new to notes</option></select>}</td></tr>
      })}</tbody></table></div><p className="mt-3 text-sm text-gray-600">Additional email addresses in notes are for reference; they are not added to broadcast recipients.</p><details className="my-3"><summary className="cursor-pointer font-semibold">Resulting notes</summary><pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">{reviewValue((preview as Record<string, unknown>).notes) || 'No notes'}</pre></details></> : <p className="my-4 text-sm">Select a matching cleaner above to compare.</p>}
      {notesTooLong ? <p role="alert" className="my-3 text-red-700">Combined notes exceed the 2,000 character limit. Keep fewer additional details to continue; nothing has been saved or truncated.</p> : null}
      {error ? <p role="alert" className="my-3 text-red-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy || !selected || notesTooLong} onClick={async () => { if (!selected || !preview) return; setBusy(true); setError(''); try { await onPrepared(selected.record.id, preview, selected.record.updated_at) } catch(e) { setError(e instanceof Error ? e.message : 'Unable to prepare changes.') } finally { setBusy(false) } }} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Review updates in existing record</button><button type="button" disabled={busy || matches.some(m => m.reasons.includes('Email'))} onClick={onSeparate} className="rounded-lg border px-4 py-2 disabled:opacity-50">Different cleaner — create separately</button><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border px-4 py-2">Back to new entry</button></div>
    </section>
  </dialog>
}
