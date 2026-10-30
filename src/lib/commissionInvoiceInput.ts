const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateCommissionInvoice(input: Record<string, unknown>) {
  const reference = String(input.reference || '').trim()
  const invoiceDate = String(input.invoiceDate || '')
  const agentId = String(input.agentId || '')
  const requestId = String(input.requestId || '')
  const amountCents = Number(input.amountCents)
  if (!uuid.test(agentId) || !uuid.test(requestId) || !reference || reference.length > 160
    || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !Number.isFinite(Date.parse(invoiceDate)) || new Date(invoiceDate).toISOString().slice(0, 10) !== invoiceDate
    || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) throw new Error('Enter a valid agent, invoice reference, date and amount.')
  if (!Array.isArray(input.allocations) || !input.allocations.length || input.allocations.length > 100) throw new Error('Allocate the invoice to between 1 and 100 sales.')
  const allocations = input.allocations.map(row => {
    if (!row || typeof row !== 'object' || !uuid.test(row.saleId) || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) throw new Error('Enter positive allocation amounts.')
    return { saleId: String(row.saleId), amountCents: Number(row.amountCents) }
  }).sort((a, b) => a.saleId.localeCompare(b.saleId))
  if (new Set(allocations.map(row => row.saleId)).size !== allocations.length || allocations.reduce((sum, row) => sum + row.amountCents, 0) !== amountCents) throw new Error('Allocate each sale once and match the invoice amount exactly.')
  return { agentId, requestId, reference, invoiceDate, amountCents, allocations }
}
export function invoiceFileType(bytes: Uint8Array) {
  if (Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-') return { type: 'application/pdf', extension: 'pdf' }
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { type: 'image/png', extension: 'png' }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: 'image/jpeg', extension: 'jpg' }
  throw new Error('Upload a PDF, PNG or JPEG invoice.')
}
