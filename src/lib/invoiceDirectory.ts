import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { canManageContractSale } from '@/lib/contractSalePolicy'
import { INVOICE_PAGE_SIZE, type InvoiceDirectoryRow, type parseInvoiceDirectoryQuery } from '@/lib/invoiceDirectoryPolicy'

type DirectoryInvoice = {
  id: string; invoice_number: string; recipient_business_snapshot: string; recipient_name_snapshot: string
  status: string; issued_at: string; due_on: string | null; total_inc_gst_cents: number
  sale: { id: string; sale_code: string; assigned_staff_id: string | null; product: { state: string; assigned_staff_id: string | null } }
}
export async function getInvoiceDirectory(actor: ContractProductActor, filters: ReturnType<typeof parseInvoiceDirectoryQuery>) {
  if (!['owner', 'manager', 'agent'].includes(actor.role) || (actor.role === 'agent' && !actor.productState)) throw new Error('Invoice access required.')
  const db = getAdminSupabase()
  let query = db.from('contract_sale_invoices').select('id, invoice_number, recipient_business_snapshot, recipient_name_snapshot, status, issued_at, due_on, total_inc_gst_cents, sale:contract_product_sales!inner(id, sale_code, assigned_staff_id, product:contract_products!inner(state, assigned_staff_id))')
  if (actor.role === 'agent') query = query.eq('sale.assigned_staff_id', actor.id).eq('sale.product.assigned_staff_id', actor.id).eq('sale.product.state', actor.productState)
  if (filters.status === 'outstanding') query = query.in('status', ['issued', 'part_paid', 'overdue'])
  else if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) query = query.or(`invoice_number.ilike.%${filters.search}%,recipient_business_snapshot.ilike.%${filters.search}%,recipient_name_snapshot.ilike.%${filters.search}%`)
  const start = filters.page * INVOICE_PAGE_SIZE
  const { data, error } = await query.order('issued_at', { ascending: false }).order('id', { ascending: false }).range(start, start + INVOICE_PAGE_SIZE)
  if (error) throw error
  const candidates = (data ?? []) as unknown as DirectoryInvoice[]
  const rows = candidates.slice(0, INVOICE_PAGE_SIZE).filter(row => row.sale && canManageContractSale(actor.role, actor.id, row.sale.assigned_staff_id)
    && (actor.role !== 'agent' || (row.sale.product?.state === actor.productState && row.sale.product.assigned_staff_id === actor.id)))
  const invoiceIds = rows.map(row => row.id)
  const totals = new Map<string, number>()
  // Do not let the REST row limit silently truncate confirmed payment totals.
  for (let offset = 0; invoiceIds.length; offset += 500) {
    const allocations = await db.from('contract_sale_payment_allocations').select('invoice_id, amount_cents')
      .in('invoice_id', invoiceIds).order('payment_id').order('invoice_id').range(offset, offset + 499)
    if (allocations.error) throw allocations.error
    for (const allocation of allocations.data ?? []) totals.set(allocation.invoice_id, (totals.get(allocation.invoice_id) ?? 0) + Number(allocation.amount_cents))
    if ((allocations.data?.length ?? 0) < 500) break
  }
  const invoices: InvoiceDirectoryRow[] = rows.map(row => ({ id: row.id, saleId: row.sale.id, saleCode: row.sale.sale_code, invoiceNumber: row.invoice_number,
    purchaser: row.recipient_business_snapshot || row.recipient_name_snapshot, status: row.status, issuedAt: row.issued_at, dueOn: row.due_on,
    totalCents: Number(row.total_inc_gst_cents), paidCents: totals.get(row.id) ?? 0 }))
  return { invoices, page: filters.page, hasMore: candidates.length > INVOICE_PAGE_SIZE }
}
