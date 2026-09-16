'use client'

import type { EmailMergeField } from '@/lib/emailMergeFields'

export default function EmailMergeFieldPicker({
  fields,
  onInsert,
  label = 'Insert database field',
  compact = false,
}: {
  fields: readonly EmailMergeField[]
  onInsert: (token: string) => void
  label?: string
  compact?: boolean
}) {
  return (
    <select
      aria-label={label}
      defaultValue=""
      onChange={(event) => {
        const token = event.currentTarget.value
        if (token) onInsert(token)
        event.currentTarget.value = ''
      }}
      className={compact
        ? 'rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal-800'
        : 'rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800'}
    >
      <option value="">Database fields…</option>
      {fields.map((item) => <option key={item.token} value={item.token}>{item.label} — {item.token}</option>)}
    </select>
  )
}
