import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const {
  CONTRACT_SALE_DEPOSIT_INC_GST_CENTS,
  buildContractSaleAgreement,
  buildMonthlyInstalments,
  buildPaymentPlanTerms,
  calculateContractSaleBalance,
  calculateInclusiveGstComponent,
  canApproveContractSalePaymentPlan,
  canConfirmContractSalePayment,
  canManageContractSale,
} = await import('../src/lib/contractSalePolicy.ts')
const { buildContractSaleTaxInvoicePdf, renderContractSaleInvoiceTemplateText } = await import('../src/lib/contractSaleInvoicePdf.ts')
const { buildContractSaleAgreementPdf, renderContractSaleAgreementEmailHtml } = await import('../src/lib/contractSaleAgreementDocument.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('deposit and GST calculations use the confirmed $500 GST-inclusive contract', () => {
  assert.equal(CONTRACT_SALE_DEPOSIT_INC_GST_CENTS, 50_000)
  assert.equal(calculateInclusiveGstComponent(50_000), 4_545)
  assert.equal(calculateContractSaleBalance(514_800, 50_000), 464_800)
  assert.equal(calculateContractSaleBalance(50_000, 50_000), 0)
})

test('monthly payment plans preserve every cent and clamp end-of-month dates', () => {
  const instalments = buildMonthlyInstalments({ balanceCents: 100_001, count: 3, firstDueOn: '2026-01-31' })
  assert.deepEqual(instalments.map((item) => item.amountCents), [33_334, 33_334, 33_333])
  assert.deepEqual(instalments.map((item) => item.dueOn), ['2026-01-31', '2026-02-28', '2026-03-31'])
  assert.equal(instalments.reduce((sum, item) => sum + item.amountCents, 0), 100_001)
  assert.throws(() => buildMonthlyInstalments({ balanceCents: 1000, count: 1, firstDueOn: '2026-01-01' }))
})

test('agents can manage assigned sales and approve plans but cannot confirm cleared funds', () => {
  assert.equal(canManageContractSale('owner', 'owner', null), true)
  assert.equal(canManageContractSale('manager', 'manager', 'agent-1'), true)
  assert.equal(canManageContractSale('agent', 'agent-1', 'agent-1'), true)
  assert.equal(canManageContractSale('agent', 'agent-1', 'agent-2'), false)
  assert.equal(canApproveContractSalePaymentPlan('agent'), true)
  assert.equal(canConfirmContractSalePayment('agent'), false)
  assert.equal(canConfirmContractSalePayment('manager'), true)
  assert.equal(canConfirmContractSalePayment('owner'), true)
})

test('agreement snapshots record conditional rights and the complete instalment schedule', () => {
  const instalments = buildMonthlyInstalments({ balanceCents: 90_000, count: 3, firstDueOn: '2026-09-01' })
  const terms = buildPaymentPlanTerms({ saleCode: 'PS-2026-01000', cleanerBusiness: 'Example Cleaner', balanceCents: 90_000, instalments })
  const agreement = buildContractSaleAgreement({ saleCode: 'PS-2026-01000', productCode: 'C001000', cleanerName: 'Alex Cleaner', cleanerBusiness: 'Example Cleaner', cleanerAbn: '12 345 678 901', cleanerAddress: '1 Example Street, Richmond, VIC, 3121', suburb: 'Richmond', state: 'VIC', purchasePriceIncGstCents: 140_000, depositIncGstCents: 50_000, paymentPlanTerms: terms })
  assert.match(agreement, /Deposit payable now: \$500\.00 including GST/)
  assert.match(agreement, /Balance after deposit: \$900\.00 including GST/)
  assert.match(agreement, /retains the benefit of, and all sale and assignment rights in, the Contract/)
  assert.match(agreement, /After handover, the Purchaser invoices the client directly/)
  assert.match(agreement, /1\. \$300\.00 due 2026-09-01/)
  for (const heading of ['PURPOSE AND TRANSACTION', 'DEPOSIT AND SITE INSPECTION', 'RETAINED RIGHTS', 'OPERATIONAL HANDOVER', 'CONFIDENTIALITY, PRIVACY AND NON-CIRCUMVENTION', 'DEFAULT, CANCELLATION AND REMEDIES', 'DISPUTES, NOTICES AND GENERAL TERMS', 'ACCEPTANCE AND EXECUTION']) assert.match(agreement, new RegExp(heading))
  assert.match(agreement, /does not guarantee the duration, renewal, profitability or future revenue/)
  assert.match(agreement, /cannot change this signed Agreement unilaterally/)
  assert.match(agreement, /Paying a deposit or attending an inspection alone does not replace that acceptance/)
  assert.doesNotMatch(agreement, /no refunds will be provided/i)
  assert.doesNotMatch(agreement, /terms and conditions may change periodically/i)
})

test('tax invoice PDF identifies the supplier, recipient, GST, full price, deposit and issuing agent', () => {
  const pdf = buildContractSaleTaxInvoicePdf({
    invoiceTitle: 'TAX INVOICE',
    invoiceNumber: 'SCINV-2026-01001', issuedOn: '2026-08-31', dueOn: null,
    supplierName: 'Secure Cleaning', supplierAbn: '81 674 121 825', supplierEmail: 'info@securecleaning.com.au',
    recipientName: 'Alex Cleaner', recipientBusiness: 'Example Cleaning Pty Ltd', recipientAbn: '12 345 678 901',
    recipientAddress: '1 Example Street, Richmond VIC 3121', description: 'Contract sale for C001001 - Richmond, VIC',
    productCode: 'C001001', saleCode: 'PS-2026-01001', totalIncGstCents: 514_800, gstComponentCents: 46_800,
    depositRequiredIncGstCents: 50_000, paidCents: 0,
    paymentTerms: '$500.00 deposit including GST is due on receipt and before the site inspection.',
    senderName: 'Melbourne Agent', senderTitle: 'Customer Relationship Manager', senderEmail: 'agent@securecleaning.com.au',
    footerNote: 'This document is a tax invoice. All amounts are in Australian dollars and include GST.',
  })
  const text = pdf.toString('latin1')
  assert.match(text, /^%PDF-1\.4/)
  for (const value of ['TAX INVOICE', 'Secure Cleaning', 'ABN 81 674 121 825', 'SCINV-2026-01001', 'Example Cleaning Pty Ltd', 'TOTAL INC GST', 'Deposit payable now', 'Melbourne Agent']) assert.match(text, new RegExp(value))
})

test('agreement is rendered as a branded PDF and structured email instead of a plain text block', () => {
  const content = buildContractSaleAgreement({ saleCode: 'PS-2026-01001', productCode: 'C001001', cleanerName: 'Alex <Cleaner>', cleanerBusiness: 'Example & Cleaning', cleanerAbn: '12 345 678 901', cleanerAddress: '1 Example Street, Richmond VIC 3121', suburb: 'Richmond', state: 'VIC', purchasePriceIncGstCents: 514_800, depositIncGstCents: 50_000 })
  const input = { content, saleCode: 'PS-2026-01001', productCode: 'C001001', cleanerBusiness: 'Example & Cleaning', preparedBy: 'Melbourne Agent', preparedOn: '2026-08-31T01:00:00Z' }
  const pdf = buildContractSaleAgreementPdf(input).toString('latin1')
  assert.match(pdf, /^%PDF-1\.4/)
  for (const value of ['Secure Cleaning', 'Cleaning contract purchase agreement', 'PS-2026-01001', 'C001001', 'PARTIES', 'Total purchase price']) assert.match(pdf, new RegExp(value))
  assert.match(pdf, /\/Count [2-9]/)
  const html = renderContractSaleAgreementEmailHtml(input)
  assert.match(html, /Contract sale document bundle/)
  assert.match(html, /tax invoice/)
  assert.match(html, /Example &amp; Cleaning/)
  assert.doesNotMatch(html, /<pre/)
})

test('editable invoice templates render only supported sale and agent tokens', () => {
  const rendered = renderContractSaleInvoiceTemplateText(
    '{invoice_number}: {product_code} for {cleaner_business}; deposit {deposit_inc_gst}; sent by {agent_name}',
    { invoiceNumber: 'SCINV-1', productCode: 'C001', saleCode: 'PS-1', cleanerName: 'Alex', cleanerBusiness: 'Example Cleaning', suburb: 'Richmond', state: 'VIC', totalIncGst: '$5,500.00', depositIncGst: '$500.00', balanceIncGst: '$5,000.00', agentName: 'Melbourne Agent', agentTitle: 'Manager' },
  )
  assert.equal(rendered, 'SCINV-1: C001 for Example Cleaning; deposit $500.00; sent by Melbourne Agent')
  assert.equal(renderContractSaleInvoiceTemplateText('Unknown {not_supported}', { invoiceNumber: '', productCode: '', saleCode: '', cleanerName: '', cleanerBusiness: '', suburb: '', state: '', totalIncGst: '', depositIncGst: '', balanceIncGst: '', agentName: '', agentTitle: '' }), 'Unknown {not_supported}')
})

test('migration is additive, idempotent, service-role only, and protects critical transitions', () => {
  const sql = source('supabase/contract_product_sales_migration.sql')
  const approvedCleanersSql = source('supabase/contract_sale_approved_cleaners_migration.sql')
  const taxInvoiceSql = source('supabase/contract_sale_tax_invoice_workflow_migration.sql')
  const documentBundleSql = source('supabase/contract_sale_document_bundle_workflow_migration.sql')
  for (const pattern of [
    /CREATE SEQUENCE IF NOT EXISTS contract_sale_code_seq/,
    /CREATE TABLE IF NOT EXISTS contract_product_sales/,
    /CREATE TABLE IF NOT EXISTS contract_sale_invoices/,
    /CREATE TABLE IF NOT EXISTS contract_sale_payments/,
    /CREATE TABLE IF NOT EXISTS contract_sale_payment_plans/,
    /CREATE TABLE IF NOT EXISTS contract_sale_inspections/,
    /CREATE TABLE IF NOT EXISTS contract_sale_agreements/,
    /ON CONFLICT \(id\) DO UPDATE SET/,
    /CREATE OR REPLACE FUNCTION create_contract_product_sale/,
    /CREATE OR REPLACE FUNCTION confirm_contract_sale_payment/,
    /CREATE OR REPLACE FUNCTION complete_contract_sale_handover/,
  ]) assert.match(sql, pattern)
  assert.match(sql, /deposit_inc_gst_cents INTEGER NOT NULL DEFAULT 50000[\s\S]+CHECK \(deposit_inc_gst_cents = 50000\)/)
  assert.match(sql, /cleaner_row\.status <> 'approved'/)
  assert.doesNotMatch(sql, /cleaner_row\.compliance_status/)
  assert.match(sql, /product_row\.status <> 'available'/)
  assert.match(sql, /idx_contract_product_sales_one_active[\s\S]+status <> 'cancelled'/)
  assert.match(sql, /idempotency_key UUID NOT NULL UNIQUE,[\s\S]+intended_invoice_id UUID NOT NULL/)
  assert.match(sql, /FOREIGN KEY\(intended_invoice_id, sale_id\)[\s\S]+REFERENCES contract_sale_invoices\(id, sale_id\)/)
  assert.match(sql, /p_actor_role NOT IN \('owner', 'manager'\)/)
  assert.equal((sql.match(/state IS NOT DISTINCT FROM p_actor_state/g) ?? []).length, 3)
  assert.match(sql, /ON CONFLICT \(payment_id, invoice_id\) DO NOTHING;[\s\S]+SELECT COALESCE\(SUM\(amount_cents\), 0\) INTO paid_total/)
  assert.match(sql, /The deposit must be confirmed before handover/)
  assert.match(sql, /Complete the site inspection before handover/)
  assert.match(sql, /Upload the signed agreement before handover/)
  assert.match(sql, /balance must be paid or an approved payment plan must be active/)
  assert.match(sql, /Issued invoice snapshots are immutable/)
  assert.match(sql, /Payment evidence is immutable after recording/)
  assert.match(sql, /Agreement snapshots and signed evidence are immutable/)
  assert.match(sql, /CREATE TRIGGER trg_contract_sale_invoice_issue BEFORE INSERT/)
  assert.match(sql, /INSERT INTO contract_sale_payment_allocations\(sale_id, payment_id, invoice_id, amount_cents\)/)
  assert.match(sql, /existing_cleaner_id IS DISTINCT FROM p_cleaner_id/)
  assert.match(sql, /ALTER TABLE contract_product_sales ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE contract_product_sales[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION create_contract_product_sale[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION create_contract_product_sale[\s\S]+TO service_role/)
  assert.match(sql, /REVOKE ALL ON FUNCTION create_contract_sale_payment_plan[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION cancel_contract_product_sale[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = public, pg_temp/g)
  assert.match(sql, /contract-sale-agreements[\s\S]+FALSE[\s\S]+application\/pdf/)
  assert.match(sql, /BEGIN;[\s\S]+COMMIT;\s*$/)
  assert.match(approvedCleanersSql, /CREATE OR REPLACE FUNCTION create_contract_product_sale/)
  assert.match(approvedCleanersSql, /CREATE OR REPLACE FUNCTION complete_contract_sale_handover/)
  assert.match(approvedCleanersSql, /cleaner_row\.status <> 'approved'/)
  assert.doesNotMatch(approvedCleanersSql, /cleaner_row\.compliance_status/)
  assert.match(approvedCleanersSql, /SECURITY DEFINER\s+SET search_path = public, pg_temp/g)
  assert.match(approvedCleanersSql, /REVOKE ALL ON FUNCTION create_contract_product_sale[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(approvedCleanersSql, /GRANT EXECUTE ON FUNCTION complete_contract_sale_handover[\s\S]+TO service_role/)
  assert.match(approvedCleanersSql, /BEGIN;[\s\S]+COMMIT;\s*$/)
  assert.match(taxInvoiceSql, /invoice_type IN \('sale', 'deposit', 'balance'\)/)
  assert.match(taxInvoiceSql, /deposit_required_inc_gst_cents/)
  assert.match(taxInvoiceSql, /supplier_abn_snapshot TEXT NOT NULL DEFAULT '81 674 121 825'/)
  assert.match(taxInvoiceSql, /sender_title_snapshot TEXT/)
  assert.match(taxInvoiceSql, /CREATE TABLE IF NOT EXISTS contract_sale_invoice_templates/)
  assert.match(taxInvoiceSql, /ALTER TABLE contract_sale_invoice_templates ENABLE ROW LEVEL SECURITY/)
  assert.match(taxInvoiceSql, /REVOKE ALL ON TABLE contract_sale_invoice_templates FROM PUBLIC, anon, authenticated/)
  assert.match(taxInvoiceSql, /ON CONFLICT \(id\) DO NOTHING/)
  assert.match(taxInvoiceSql, /email_subject_template_snapshot/)
  assert.match(taxInvoiceSql, /CREATE OR REPLACE FUNCTION confirm_contract_sale_payment/)
  assert.match(taxInvoiceSql, /CREATE OR REPLACE FUNCTION complete_contract_sale_handover/)
  assert.match(taxInvoiceSql, /SECURITY DEFINER\s+SET search_path = public, pg_temp/g)
  assert.match(taxInvoiceSql, /REVOKE ALL ON FUNCTION confirm_contract_sale_payment[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(taxInvoiceSql, /GRANT EXECUTE ON FUNCTION complete_contract_sale_handover[\s\S]+TO service_role/)
  assert.match(taxInvoiceSql, /BEGIN;[\s\S]+COMMIT;\s*$/)
  assert.match(documentBundleSql, /ADD COLUMN IF NOT EXISTS price_finalised_at TIMESTAMPTZ/)
  assert.match(documentBundleSql, /CREATE OR REPLACE FUNCTION update_contract_sale_overview/)
  assert.match(documentBundleSql, /SECURITY DEFINER\s+SET search_path = public, pg_temp/)
  assert.match(documentBundleSql, /REVOKE ALL ON FUNCTION update_contract_sale_overview[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(documentBundleSql, /GRANT EXECUTE ON FUNCTION update_contract_sale_overview[\s\S]+TO service_role/)
  assert.match(documentBundleSql, /purchase price cannot change after a tax invoice or agreement snapshot exists/i)
  assert.match(documentBundleSql, /invoice sender is immutable after its first delivery/i)
  assert.match(documentBundleSql, /OLD\.delivery_status NOT IN \('pending', 'failed'\)/)
  assert.match(documentBundleSql, /sale_row\.price_finalised_at IS NULL/)
  assert.doesNotMatch(documentBundleSql, /signed sale agreement is required before invoicing/i)
  assert.match(documentBundleSql, /UPDATE contract_product_sales sale[\s\S]+price_finalised_at IS NULL[\s\S]+contract_sale_invoices[\s\S]+contract_sale_agreements/)
  assert.match(documentBundleSql, /BEGIN;[\s\S]+COMMIT;\s*$/)
})

test('server actions recheck assignment, state, invoice amounts, recipient, and workflow gates', () => {
  const domain = source('src/lib/contractSales.ts')
  const productsDomain = source('src/lib/contractProducts.ts')
  const route = source('src/app/api/admin/contract-sales/route.ts')
  const invoiceRoute = source('src/app/api/admin/contract-sales/invoices/route.ts')
  assert.match(domain, /canManageContractSale\(actor\.role, actor\.id, data\.assigned_staff_id\)/)
  assert.match(domain, /product\.state !== actor\.productState/)
  assert.match(domain, /CONTRACT_SALE_DEPOSIT_INC_GST_CENTS/)
  assert.match(domain, /context\.cleaner\.status !== 'approved'/)
  assert.doesNotMatch(domain, /context\.cleaner\.compliance_status !== 'current'/)
  assert.match(domain, /normalizeInvoiceEmail\(context\.cleaner\.email\)/)
  assert.match(domain, /const invoiceType = 'sale'/)
  assert.doesNotMatch(domain, /sale agreement must be signed before the tax invoice is issued/)
  assert.match(domain, /Save and finalise the GST-inclusive purchase price before preparing the tax invoice/)
  assert.match(domain, /supplier_abn_snapshot: invoiceTemplate\.supplierAbn/)
  assert.match(domain, /Only an owner or manager can edit the invoice template/)
  assert.match(domain, /contract_sale_invoice_templates/)
  assert.match(domain, /invoice_title_snapshot: invoiceTemplate\.invoiceTitle/)
  assert.match(domain, /renderContractSaleInvoiceTemplateText/)
  assert.match(domain, /sender_name_snapshot: actor\.displayName, sender_title_snapshot: actor\.jobTitle/)
  assert.match(domain, /attachments: \[\{ filename: fileName, content: pdf\.toString\('base64'\) \}\]/)
  assert.match(domain, /agreement-[\s\S]+agreementPdf\.toString\('base64'\)/)
  assert.match(domain, /contract_sale\.documents\.sent/)
  assert.match(domain, /sender_name_snapshot: actor\.displayName, sender_title_snapshot: actor\.jobTitle/)
  assert.match(domain, /same sender must send any replacement agreement bundle/)
  assert.match(domain, /The agreement and tax invoice recipients do not match/)
  assert.match(domain, /\{deposit_inc_gst\} deposit including GST is due on receipt[\s\S]+\{balance_inc_gst\} is due before cleaning commences/)
  assert.match(domain, /The \$500 deposit must be confirmed before booking the inspection/)
  assert.match(domain, /Upload the signed agreement before booking the inspection/)
  assert.match(domain, /idempotency_key: idempotencyKey, sale_id: sale\.id, intended_invoice_id: invoiceId/)
  assert.doesNotMatch(domain, /invoice\.invoice_type\) === 'deposit' \? 'deposit_due' : 'balance_due'/)
  assert.match(productsDomain, /purchasePrice \* 1\.1\) <= 50_000/)
  assert.match(domain, /Only an unsigned draft or sent agreement can receive its first signed PDF/)
  for (const zone of ['Australia/Sydney', 'Australia/Darwin', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Perth']) assert.match(domain, new RegExp(zone.replace('/', '\\/')))
  assert.match(route, /rejectCrossOriginMutation/)
  assert.match(route, /rejectLargePayload/)
  assert.match(route, /rateLimit/)
  assert.match(route, /getContractProductActor/)
  assert.match(route, /invoice-template\.update/)
  assert.match(invoiceRoute, /getContractProductActor/)
  assert.match(invoiceRoute, /downloadContractSaleInvoice/)
  assert.match(invoiceRoute, /Cache-Control': 'private, no-store'/)
})

test('workbench keeps connected records together and exposes the complete gated workflow', () => {
  const workspace = source('src/components/admin/ContractSalesWorkspace.tsx')
  const agentCleaners = source('src/components/availability/AgentCleaners.tsx')
  const cleanerDomain = source('src/lib/cleaners.ts')
  const products = source('src/components/admin/ContractProductsWorkspace.tsx')
  const adminNav = source('src/components/admin/AdminNav.tsx')
  const agentNav = source('src/components/availability/AvailabilityAgentNav.tsx')
  for (const label of ['Quote', 'Client', 'Product', 'Product sale', 'Prepare full tax invoice', 'Send agreement &amp; tax invoice', 'Schedule &amp; send invites', 'Upload signed PDF', 'Record payment', 'Approve plan', 'Complete handover']) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(workspace, /Create pending cleaner/)
  assert.match(workspace, />New sale<\/button>/)
  assert.match(workspace, /paymentRequestId/)
  assert.match(workspace, /\['overview', 'invoices', 'agreement', 'inspection', 'activity'\]/)
  assert.match(workspace, /Full sale tax invoice/)
  assert.match(workspace, /Download PDF/)
  assert.match(workspace, /Save invoice template/)
  assert.match(workspace, /Issued invoices remain unchanged/)
  assert.match(workspace, /Secure online acceptance remains a later enhancement/)
  assert.match(workspace, /Create updated agreement version/)
  assert.match(workspace, /Final purchase price \(inc GST\)/)
  assert.match(workspace, /AgreementPreview content=/)
  assert.doesNotMatch(workspace, /<pre className=/)
  assert.match(workspace, /cleaner\.status !== 'approved'/)
  assert.doesNotMatch(workspace, /disabled=\{cleaner\.status !== 'approved' \|\| cleaner\.complianceStatus/)
  assert.match(workspace, /This is a warning only; the approved cleaner status controls sale eligibility/)
  assert.match(agentCleaners, /CLEANER_COMPLIANCE_STATUSES\.map/)
  assert.match(agentCleaners, /Informational only\. Approved status controls sale eligibility/)
  assert.match(cleanerDomain, /Select a valid compliance status/)
  assert.match(cleanerDomain, /complianceStatus: isCleanerComplianceStatus\(record\.complianceStatus\) \? record\.complianceStatus : 'not_checked'/)
  assert.match(workspace, /data\.actor\.role === 'owner' \|\| data\.actor\.role === 'manager'/)
  assert.match(products, />Product sale<\/Link>/)
  assert.match(adminNav, /Product Sales/)
  assert.match(agentNav, /Product sales/)
})

test('electronic acceptance is explicitly deferred until identity and immutable-version evidence exist', () => {
  const backlog = source('docs/contract-sale-electronic-acceptance-backlog.md')
  for (const requirement of ['single-use, expiring cleaner link', 'immutable agreement version', 'identity, authority and intent', 'agreement hash', 'Do not infer acceptance merely from payment']) assert.match(backlog, new RegExp(requirement))
})
