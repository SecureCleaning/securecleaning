'use client'

type Props = {
  open: boolean
  description?: string
  title?: string
  subject: string
  from?: string
  to?: string
  replyTo?: string
  cc?: string
  html: string
  attachments?: { filename: string; url: string }[]
  warnings?: string[]
  sendLabel?: string
  sending?: boolean
  onClose: () => void
  onSend?: () => void
}

export default function EmailPreviewModal({ open, title = 'Email preview', description = 'This is the complete email, including protected system content.', subject, from, to, cc, replyTo, html, attachments = [], warnings = [], sendLabel = 'Confirm & send', sending = false, onClose, onSend }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Close</button>
        </div>
        <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm">
          {from ? <p><span className="font-semibold text-gray-700">From:</span> {from}</p> : null}
          {replyTo ? <p><span className="font-semibold text-gray-700">Reply-To:</span> {replyTo}</p> : null}
          {to ? <p><span className="font-semibold text-gray-700">To:</span> {to}</p> : null}
          {cc ? <p><span className="font-semibold text-gray-700">CC:</span> {cc}</p> : null}
          <p><span className="font-semibold text-gray-700">Subject:</span> {subject}</p>
          {attachments.map(attachment => <p key={attachment.url} className="mt-2"><span className="font-semibold text-gray-700">Attachment:</span> <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline">{attachment.filename} (preview PDF)</a></p>)}
          {warnings.map(warning => <p key={warning} className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">{warning}</p>)}
        </div>
        <div className="min-h-0 flex-auto overflow-hidden bg-gray-100 p-3" style={{ height: '58vh' }}>
          <iframe title="Rendered email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} className="h-full w-full rounded-lg border border-gray-200 bg-white" />
        </div>
        {onSend ? <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Back to editing</button><button type="button" onClick={onSend} disabled={sending} className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{sending ? 'Sending…' : sendLabel}</button></div> : null}
      </div>
    </div>
  )
}
