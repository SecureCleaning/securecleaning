export type DocumentAction = 'replace' | 'remove' | 'support' | 'remove_support'
export function parseDocumentCorrection(action: unknown, reason: unknown, revision: unknown) {
  if (!['replace', 'remove', 'support', 'remove_support'].includes(String(action))) throw new Error('Choose a document action.')
  const explanation = typeof reason === 'string' ? reason.trim() : ''
  if (explanation.length < 5 || explanation.length > 1000) throw new Error('Enter a reason between 5 and 1,000 characters.')
  const version = Number(revision)
  if (revision === null || revision === '' || !Number.isSafeInteger(version) || version < 0) throw new Error('Refresh the document list before making changes.')
  return { action: action as DocumentAction, reason: explanation, revision: version }
}
export function assertAgreementPdf(file: { type: string; size: number }, bytes: Uint8Array) {
  if (file.type !== 'application/pdf' || file.size <= 0 || file.size > 10 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') throw new Error('Upload a valid PDF smaller than 10 MB.')
}
