// Shared display policy deliberately returns no storage paths, old files, reasons or staff details.
type Agreement = { id: string; version: number; status: string; signed_at: string | null; signed_file_name: string | null }
type DocumentEvent = { id: string; agreement_id: string; action: string; target_id: string | null; created_at: string; after_evidence: unknown }
export function visibleAgreementDocuments(agreements: Agreement[], events: DocumentEvent[]) {
  const current = [...agreements].sort((a, b) => b.version - a.version)[0]
  const removed = new Set(events.filter(row => row.action === 'remove_support').map(row => row.target_id))
  const versions = new Map(agreements.filter(row => row.status !== 'void').map(row => [row.id, row.version]))
  const supporting = events.filter(row => row.action === 'support' && !removed.has(row.id) && versions.has(row.agreement_id)).map(row => ({
    id: row.id, agreementId: row.agreement_id, version: versions.get(row.agreement_id)!,
    fileName: String((row.after_evidence as { file_name?: string } | null)?.file_name || 'Supporting document.pdf'), uploadedAt: row.created_at,
  }))
  const currentUpdates = events.filter(row => row.agreement_id === current?.id && ['replace', 'remove'].includes(row.action))
  const latest = (values: (string | null | undefined)[]) => values.filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
  const signed = current?.status === 'signed' && current.signed_file_name ? {
    agreementId: current.id, version: current.version, fileName: current.signed_file_name,
    updatedAt: latest([current.signed_at, ...currentUpdates.map(row => row.created_at)]),
    replaced: currentUpdates.some(row => row.action === 'replace'),
  } : null
  return { signed, supporting, updatedAt: latest([current?.signed_at, ...events.map(row => row.created_at)]), correctionPending: currentUpdates.sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at))[0]?.action === 'remove' && !signed }
}
export type VisibleAgreementDocuments = ReturnType<typeof visibleAgreementDocuments>
