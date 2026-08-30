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
  const agreement = buildContractSaleAgreement({ saleCode: 'PS-2026-01000', productCode: 'C001000', cleanerName: 'Alex Cleaner', cleanerBusiness: 'Example Cleaner', suburb: 'Richmond', state: 'VIC', purchasePriceIncGstCents: 140_000, depositIncGstCents: 50_000, paymentPlanTerms: terms })
  assert.match(agreement, /Deposit: \$500\.00 including GST, due on receipt and before the site inspection/)
  assert.match(agreement, /retains the contractual sale and assignment rights until the purchase price is paid in full/)
  assert.match(agreement, /The cleaner will invoice the client directly after the operational handover/)
  assert.match(agreement, /1\. \$300\.00 due 2026-09-01/)
})

test('migration is additive, idempotent, service-role only, and protects critical transitions', () => {
  const sql = source('supabase/contract_product_sales_migration.sql')
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
})

test('server actions recheck assignment, state, invoice amounts, recipient, and workflow gates', () => {
  const domain = source('src/lib/contractSales.ts')
  const productsDomain = source('src/lib/contractProducts.ts')
  const route = source('src/app/api/admin/contract-sales/route.ts')
  assert.match(domain, /canManageContractSale\(actor\.role, actor\.id, data\.assigned_staff_id\)/)
  assert.match(domain, /product\.state !== actor\.productState/)
  assert.match(domain, /CONTRACT_SALE_DEPOSIT_INC_GST_CENTS/)
  assert.match(domain, /context\.cleaner\.status !== 'approved'/)
  assert.match(domain, /normalizeInvoiceEmail\(context\.cleaner\.email\)/)
  assert.match(domain, /deposit[\s\S]+inspection[\s\S]+agreement[\s\S]+before issuing the balance/)
  assert.match(domain, /The \$500 deposit must be confirmed before booking the inspection/)
  assert.match(domain, /idempotency_key: idempotencyKey, sale_id: sale\.id, intended_invoice_id: invoiceId/)
  assert.doesNotMatch(domain, /invoice\.invoice_type\) === 'deposit' \? 'deposit_due' : 'balance_due'/)
  assert.match(productsDomain, /purchasePrice \* 1\.1\) <= 50_000/)
  assert.match(domain, /Only an unsigned draft or sent agreement can receive its first signed PDF/)
  for (const zone of ['Australia/Sydney', 'Australia/Darwin', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Perth']) assert.match(domain, new RegExp(zone.replace('/', '\\/')))
  assert.match(route, /rejectCrossOriginMutation/)
  assert.match(route, /rejectLargePayload/)
  assert.match(route, /rateLimit/)
  assert.match(route, /getContractProductActor/)
})

test('workbench keeps connected records together and exposes the complete gated workflow', () => {
  const workspace = source('src/components/admin/ContractSalesWorkspace.tsx')
  const products = source('src/components/admin/ContractProductsWorkspace.tsx')
  const adminNav = source('src/components/admin/AdminNav.tsx')
  const agentNav = source('src/components/availability/AvailabilityAgentNav.tsx')
  for (const label of ['Quote', 'Client', 'Product', 'Product sale', 'Issue $500 deposit', 'Schedule &amp; send invites', 'Upload signed PDF', 'Record payment', 'Approve plan', 'Complete handover']) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(workspace, /Create pending cleaner/)
  assert.match(workspace, />New sale<\/button>/)
  assert.match(workspace, /paymentRequestId/)
  assert.match(workspace, /cleaner\.status !== 'approved'/)
  assert.match(workspace, /\['owner', 'manager'\]\.includes\(data\.actor\.role\)/)
  assert.match(products, />Product sale<\/Link>/)
  assert.match(adminNav, /Product Sales/)
  assert.match(agentNav, /Product sales/)
})
