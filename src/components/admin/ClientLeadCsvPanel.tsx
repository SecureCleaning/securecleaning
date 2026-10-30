'use client'

import { useState } from 'react'
import type { parseLeadCsv } from '@/lib/clientLeadCsv'
import ActionToast from '@/components/ActionToast'

type PreviewRows = ReturnType<typeof parseLeadCsv>
type ImportResult = { row: number; id?: string; error?: string; excluded?: boolean }

export default function ClientLeadCsvPanel({ reload }: { reload: () => Promise<void> }) {
  const [csv, setCsv] = useState('')
  const [rows, setRows] = useState<PreviewRows>([])
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])

  const includedCount = rows.filter(row => !excludedRows.has(row.row)).length
  const blockingErrorCount = rows.filter(row => !excludedRows.has(row.row) && row.errors.length > 0).length

  function toggleExcluded(rowNumber: number) {
    setExcludedRows(current => {
      const next = new Set(current)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  async function run(action: 'csv.preview' | 'csv.import') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/client-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, csv, excludedRows: action === 'csv.import' ? [...excludedRows] : undefined }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (action === 'csv.preview') {
        const previewRows = result.result as PreviewRows
        setRows(previewRows)
        setExcludedRows(new Set(previewRows.filter(row => row.errors.length > 0).map(row => row.row)))
      } else {
        const importResults = result.result as ImportResult[]
        const imported = importResults.filter(row => row.id).length
        const excluded = importResults.filter(row => row.excluded).length
        setResults(importResults)
        setRows([])
        setExcludedRows(new Set())
        await reload()
        setMessage(`${imported} lead${imported === 1 ? '' : 's'} imported. ${excluded} row${excluded === 1 ? '' : 's'} excluded for later review.`)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to process CSV.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="rounded-2xl border bg-white p-5">
    <summary className="cursor-pointer font-bold">Import / export client leads</summary>
    <p className="my-3 text-sm text-gray-600">Use the template headers. Blank first names default to Manager. Required: email, postcode, city (sydney/NSW, melbourne/VIC or brisbane/QLD), contact_basis (Client enquiry, Purchased lead provider, Existing business relationship or Relevant published business contact). Source types: Manual entry, Online quote, Purchased lead, Cold outreach or Direct booking. Internal codes are also accepted. Official website maps to Cold outreach; Public business contact maps to Relevant published business contact. Use a premises type code or name (Childcare centre is accepted as Childcare); describe Other in premises_type_other. Purchased/cold leads need source_provider. Up to 200 rows per import. Imports do not send messages. Existing records are never overwritten.</p>
    <div className="flex flex-wrap gap-3">
      <a href="/api/admin/client-crm?csv=template" className="rounded border p-2">Download CSV template</a>
      <a href="/api/admin/client-crm?csv=export" className="rounded border p-2">Export accessible client leads</a>
      <input type="file" accept=".csv,text/csv" disabled={busy} aria-label="Upload lead CSV" onChange={async event => {
        setRows([])
        setExcludedRows(new Set())
        setResults([])
        setCsv('')
        const file = event.target.files?.[0]
        if (!file) return
        if (file.size > 500000) { setError('CSV must be smaller than 500 KB.'); return }
        setCsv(await file.text())
      }} />
      <button type="button" disabled={busy || !csv} onClick={() => void run('csv.preview')} className="rounded border p-2 disabled:opacity-50">Validate and preview</button>
    </div>
    {rows.length ? <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p><strong>{includedCount}</strong> included · <strong>{excludedRows.size}</strong> excluded</p>
        <p className="text-gray-600">Rows with errors are excluded automatically. Correct the CSV and preview again before including one.</p>
      </div>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th>Row</th><th>Exclude</th><th>Business / contact</th><th>Premises type</th><th>Validation</th></tr></thead>
          <tbody>{rows.map(row => {
            const excluded = excludedRows.has(row.row)
            return <tr key={row.row} className={`border-t ${excluded ? 'bg-gray-50 text-gray-500' : ''}`}>
              <td>{row.row}</td>
              <td><input type="checkbox" checked={excluded} disabled={busy} onChange={() => toggleExcluded(row.row)} aria-label={`Exclude row ${row.row} from import`} /></td>
              <td>{row.record.business_name}<br />{[row.record.first_name, row.record.last_name].filter(Boolean).join(' ')}<br />{row.record.email}</td>
              <td>{row.record.premises_type}</td>
              <td className={row.errors.length ? 'text-red-700' : ''}>{row.errors.join('; ') || 'Ready'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      {blockingErrorCount ? <p className="mt-3 text-sm text-red-700">Exclude or correct the remaining {blockingErrorCount} error row{blockingErrorCount === 1 ? '' : 's'} before importing.</p> : null}
      <button type="button" disabled={busy || includedCount === 0 || blockingErrorCount > 0} onClick={() => void run('csv.import')} className="mt-3 rounded bg-teal-700 p-3 text-white disabled:opacity-50">Import {includedCount} included lead{includedCount === 1 ? '' : 's'}</button>
    </> : null}
    {results.length ? <ul className="mt-4 max-h-64 overflow-auto text-sm">{results.map(row => <li key={row.row}>Row {row.row}: {row.excluded ? 'Excluded for later review' : row.error || 'Saved'}</li>)}</ul> : null}
    <ActionToast message={error || message} tone={error ? 'error' : 'success'} onDismiss={() => { setError(''); setMessage('') }} />
  </details>
}

