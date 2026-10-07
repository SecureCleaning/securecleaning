'use client'
import { useEffect, useState } from 'react'
import { getAdminHeaders } from '@/lib/useAdminHeaders'
type Sender = { id: string; displayName: string; from: string; replyTo: string; cc: string; signature: string; missing: string[] }
type Context = { defaultSenderId: string; canChooseSender: boolean; senders: Sender[] }
export default function CleanerEmailDetails({ senderId = '', onChange, disabled = false, endpoint = '/api/admin/cleaners/email-senders' }: { senderId?: string; onChange?: (id: string) => void; disabled?: boolean; endpoint?: string }) {
  const [context, setContext] = useState<Context | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setContext(null); setError('')
    fetch(endpoint, { headers: getAdminHeaders(), cache: 'no-store' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load email details.')
      if (!cancelled) setContext(result)
    }).catch(issue => { if (!cancelled) setError(issue instanceof Error ? issue.message : 'Unable to load email details.') })
    return () => { cancelled = true }
  }, [endpoint])
  const selected = context?.senders.find(sender => sender.id === (senderId || context.defaultSenderId))
  return <section aria-label="Email details" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
    <h3 className="font-semibold">Email details</h3>
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : !context ? <p className="mt-2">Loading your Team Access signature...</p> : null}
    {context?.canChooseSender && onChange ? <label className="mt-3 block font-medium">Send on behalf of<select disabled={disabled} value={senderId || context.defaultSenderId} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2">{context.senders.map(sender => <option key={sender.id} value={sender.id}>{sender.displayName}{sender.missing.length ? ' - signature incomplete' : ''}</option>)}</select></label> : null}
    {selected ? <><p className="mt-3 break-words"><strong>From:</strong> {selected.from}</p><p className="break-words"><strong>Reply-To / CC:</strong> {selected.replyTo}</p><div className="mt-3 whitespace-pre-line">{selected.signature}</div>{selected.missing.length ? <p role="alert" className="mt-3 text-red-700">Complete Team Access before sending: {selected.missing.join(', ')}.</p> : null}</> : null}
    <p className="mt-3 text-xs text-slate-500">This signature is added automatically to the preview and sent email. Changing the sender requires a new preview. Saving a template never sends mail.</p>
  </section>
}
