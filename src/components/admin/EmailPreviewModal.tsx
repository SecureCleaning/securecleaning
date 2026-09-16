'use client'

type Props = {
  open: boolean
  title?: string
  subject: string
  from?: string
  to?: string
  cc?: string
  html: string
  sendLabel?: string
  sending?: boolean
  onClose: () => void
  onSend?: () => void
}

export default function EmailPreviewModal({ open, title = 'Email preview', subject, from, to, cc, html, sendLabel = 'Confirm & send', sending = false, onClose, onSend }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">This is the complete email, including protected system content.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Close</button>
        </div>
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm">
          {from ? <p><span className="font-semibold text-gray-700">From:</span> {from}</p> : null}
          {to ? <p><span className="font-semibold text-gray-700">To:</span> {to}</p> : null}
          {cc ? <p><span className="font-semibold text-gray-700">CC:</span> {cc}</p> : null}
          <p><span className="font-semibold text-gray-700">Subject:</span> {subject}</p>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100 p-3">
          <iframe title="Rendered email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} className="h-[58vh] w-full rounded-lg border border-gray-200 bg-white" />
        </div>
        {onSend ? <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Back to editing</button><button type="button" onClick={onSend} disabled={sending} className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{sending ? 'Sending…' : sendLabel}</button></div> : null}
      </div>
    </div>
  )
}
