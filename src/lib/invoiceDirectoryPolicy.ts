export const INVOICE_PAGE_SIZE = 25
export const INVOICE_FILTERS = ['all', 'outstanding', 'issued', 'part_paid', 'paid', 'overdue', 'void'] as const
export type InvoiceFilter = typeof INVOICE_FILTERS[number]
export type InvoiceDirectoryRow = {
  id: string; saleId: string; saleCode: string; invoiceNumber: string; purchaser: string
  status: string; issuedAt: string; dueOn: string | null; totalCents: number; paidCents: number
}
export function parseInvoiceDirectoryQuery(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '0')
  const status = params.get('status') ?? 'all'
  const rawSearch = params.get('q') ?? ''
  if (!Number.isInteger(page) || page < 0 || page > 10000 || !INVOICE_FILTERS.includes(status as InvoiceFilter) || rawSearch.length > 100) throw new Error('Invalid invoice filters.')
  // PostgREST filter punctuation must never be interpreted as query structure.
  const search = rawSearch.replace(/[^\p{L}\p{N}\s@&'-]/gu, ' ').replace(/\s+/g, ' ').trim()
  return { page, status: status as InvoiceFilter, search }
}
export function invoiceWorkspaceHref(saleId: string, invoiceId: string, assigneeId = '') {
  const base = assigneeId ? `/availability/sales/${encodeURIComponent(assigneeId)}` : '/admin/sales'
  return `${base}?${new URLSearchParams({ sale: saleId, invoice: invoiceId, tab: 'invoices' })}`
}

export function resolveInvoiceSelection<T extends { id: string; assignedStaffId: string | null; state: string; invoices: Array<{ id: string }> }>(sales: T[], actor: { id: string; role: string; state: string | null }, saleId: string, invoiceId: string): T {
  const sale = sales.find(item => item.id === saleId)
  if (!sale || !['owner', 'manager', 'agent'].includes(actor.role)
    || (actor.role === 'agent' && (sale.assignedStaffId !== actor.id || !actor.state || sale.state !== actor.state))
    || (invoiceId && !sale.invoices.some(invoice => invoice.id === invoiceId))) {
    throw new Error('The requested invoice is not available. Return to Invoices and choose an accessible record.')
  }
  return sale
}
