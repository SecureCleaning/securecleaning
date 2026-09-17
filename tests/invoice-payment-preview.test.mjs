import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
globalThis.require = createRequire(import.meta.url)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-key'
const { downloadContractSaleInvoice, resendContractSaleInvoice, sendContractSaleAgreement } = await import('../src/lib/contractSales.ts')
process.env.ADMIN_SESSION_SECRET = 'invoice-preview-test-secret'
const { GET } = await import('../src/app/api/admin/contract-sales/invoices/route.ts')
const { ADMIN_SESSION_COOKIE, createAdminSessionToken } = await import('../src/lib/adminAuth.ts')
const actor = { id: '11111111-1111-4111-8111-111111111111', username: 'owner', role: 'owner', email: 'owner@example.test', displayName: 'Test Owner' }
const invoice = {
  id: 'invoice-1', invoice_number: 'SCINV-2026-01001', invoice_type: 'sale', status: 'part_paid', delivery_status: 'sent',
  recipient_email_snapshot: 'cleaner@example.test', recipient_name_snapshot: 'Alex Cleaner', recipient_business_snapshot: 'Example Cleaning Pty Ltd',
  supplier_name_snapshot: 'Secure Cleaning', supplier_abn_snapshot: '81 674 121 825', supplier_email_snapshot: 'info@securecleaning.com.au',
  invoice_title_snapshot: 'TAX INVOICE', description_snapshot: 'Contract sale for {product_code} - {suburb}, {state}',
  total_inc_gst_cents: 514800, gst_component_cents: 46800, deposit_required_inc_gst_cents: 50000,
  payment_terms_snapshot: '{deposit_inc_gst} deposit including GST is due on receipt and must clear before the site inspection. The remaining balance of {balance_inc_gst} is due before cleaning commences unless an approved payment plan applies.',
  sender_name_snapshot: 'Test Owner', sender_email_snapshot: 'owner@example.test', issued_at: '2026-09-17T00:00:00Z',
}
function backend({ paid = 50000, failLedger = false, status = 'part_paid', state = 'NSW', assigned = null } = {}) {
  const sent = []
  const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  return { sent, fetch: async (url, init = {}) => {
    const parsed = new URL(url)
    const table = parsed.pathname.split('/').pop()
    if (parsed.hostname === 'api.resend.com') { sent.push(JSON.parse(init.body)); return json({ id: 'synthetic-send' }) }
    if (table === 'contract_product_sales') return json({ id: 'sale-1', sale_code: 'PS-2026-01001', product_id: 'product-1', cleaner_id: 'cleaner-1', opportunity_id: 'opp-1', source_quote_id: 'quote-1', assigned_staff_id: assigned })
    if (table === 'contract_products') return json({ id: 'product-1', product_code: 'C001001', state, suburb: 'Alexandria' })
    if (table === 'cleaners') return json({ contact_name: 'Alex Cleaner', email: 'cleaner@example.test', status: 'approved' })
    if (table === 'crm_opportunities') return json({ primary_contact_id: 'client-1' })
    if (table === 'quotes') return json({ quote_ref: 'Q-1' })
    if (table === 'clients') return json({})
    if (table === 'admin_staff_accounts') return json({ id: actor.id, username: actor.username, role: actor.role, active: true, email: actor.email, display_name: actor.displayName })
    if (table === 'contract_sale_agreements') return json({ id: 'agreement-1', version: 1, status: 'draft', content_snapshot: 'Agreement test', cleaner_email_snapshot: 'cleaner@example.test', cleaner_business_snapshot: 'Example Cleaning', created_at: '2026-09-17' })
    if (table === 'contract_sale_invoices') {
      if (parsed.searchParams.has('id')) assert.equal(parsed.searchParams.get('id'), 'eq.invoice-1')
      if (init.method !== 'PATCH') assert.equal(parsed.searchParams.get('sale_id'), 'eq.sale-1')
      return init.method === 'PATCH' ? new Response(null, { status: 204 }) : json({ ...invoice, status })
    }
    if (table === 'contract_sale_payment_allocations') {
      assert.equal(parsed.searchParams.get('invoice_id'), 'eq.invoice-1')
      assert.equal(parsed.searchParams.get('select'), 'payment_id,amount_cents')
      if (failLedger) return new Response(JSON.stringify({ message: 'Ledger unavailable' }), { status: 400 })
      return json(paid ? [{ payment_id: 'confirmed-1', amount_cents: paid }] : [])
    }
    if (table === 'admin_audit_log') return new Response(null, { status: 201 })
    throw new Error(`Unexpected fixture table ${table}`)
  } }
}

test('preview/download and resend use identical PDFs and confirmed balances at every payment stage', async () => {
  const previous = globalThis.fetch
  try {
    for (const [paid, outstanding, deposit] of [[0,'5,148.00','500.00'],[20000,'4,948.00','300.00'],[50000,'4,648.00','0.00'],[125000,'3,898.00','0.00'],[514800,'0.00','0.00']]) {
      const mock = backend({ paid }); globalThis.fetch = mock.fetch
      const preview = await downloadContractSaleInvoice(actor, 'sale-1', 'invoice-1')
      await resendContractSaleInvoice(actor, { saleId: 'sale-1', invoiceId: 'invoice-1' })
      assert.equal(mock.sent.length, 1)
      assert.equal(mock.sent[0].attachments[0].content, preview.pdf.toString('base64'))
      assert.ok(mock.sent[0].html.includes(`<strong>Outstanding balance:</strong> $${outstanding}`))
      assert.ok(mock.sent[0].html.includes(`<strong>Deposit payable now:</strong> $${deposit}`))
      const text = preview.pdf.toString('latin1')
      assert.ok(text.includes('Payments received \\(confirmed\\):'))
      assert.ok(text.includes(`($${outstanding})`))
      assert.doesNotMatch(text, /Outstanding at issue/)
      if (process.env.INVOICE_QA_OUTPUT && paid === 50000) writeFileSync(process.env.INVOICE_QA_OUTPUT, preview.pdf)
    }
  } finally { globalThis.fetch = previous }
})

test('ledger failures stop preview and resend before any email; void and unauthorized sales are rejected', async () => {
  const previous = globalThis.fetch
  try {
    for (const options of [{failLedger:true},{status:'void'}]) {
      const mock = backend(options); globalThis.fetch = mock.fetch
      await assert.rejects(downloadContractSaleInvoice(actor, 'sale-1', 'invoice-1'))
      await assert.rejects(resendContractSaleInvoice(actor, {saleId:'sale-1',invoiceId:'invoice-1'}))
      assert.equal(mock.sent.length, 0)
    }
    for (const options of [{assigned:'another-agent'},{assigned:'agent',state:'VIC'}]) {
      const mock = backend(options); globalThis.fetch = mock.fetch
      await assert.rejects(downloadContractSaleInvoice({...actor,id:'agent',role:'agent',productState:'NSW'}, 'sale-1', 'invoice-1'), /not found/)
      assert.equal(mock.sent.length, 0)
    }
  } finally { globalThis.fetch = previous }
})


test('agreement bundle includes the same current paid invoice as preview', async () => {
  const previous = globalThis.fetch
  const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const preview = await downloadContractSaleInvoice(actor, 'sale-1', 'invoice-1')
    await sendContractSaleAgreement(actor, {saleId:'sale-1', agreementId:'agreement-1'})
    assert.equal(mock.sent.length, 1)
    assert.equal(mock.sent[0].attachments[0].content, preview.pdf.toString('base64'))
  } finally { globalThis.fetch = previous }
})

test('PDF endpoint authorizes preview and preserves private downloads by default', async () => {
  const previous = globalThis.fetch
  const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const base = 'https://example.test/api/admin/contract-sales/invoices?saleId=sale-1&invoiceId=invoice-1'
    assert.equal((await GET(new NextRequest(base + '&preview=1'))).status, 403)
    const headers = {cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken(actor)}`}
    for (const [query, disposition] of [['','attachment'],['&preview=1','inline']]) {
      const response = await GET(new NextRequest(base + query, {headers}))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'application/pdf')
      assert.ok(response.headers.get('content-disposition').startsWith(disposition + ';'))
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
    }
    assert.equal(mock.sent.length, 0)
  } finally { globalThis.fetch = previous }
})
