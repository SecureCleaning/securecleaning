import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { handoverDraft, isHandoverTemplate } from '../src/lib/contractSaleHandoverTemplates.ts'
import { FOLLOWUP_TEMPLATES, followupDraft } from '../src/lib/contractSaleFollowupTemplates.ts'
import { parseRichEmailContent, richEmailFingerprint } from '../src/lib/richEmailServer.ts'
import { plainTextToEmailHtml } from '../src/lib/richEmailContent.ts'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/lib/contractSaleFollowups.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
class ProductError extends Error {}
class Rejected extends Error {}
function harness(options = {}) {
  const rows = new Map()
  let sends = 0
  let authorized = 0
  const db = { from(table) {
    const filters = {}
    let operation = 'select', value
    const query = {
      select() { return query }, eq(key, val) { filters[key] = val; return query }, order() { return query }, limit() { return query },
      insert(row) { operation = 'insert'; value = row; return query }, update(row) { operation = 'update'; value = row; return query },
      maybeSingle() { return query },
      then(resolve) {
        let data = null, error = null
        if (table === 'contract_sale_inspections') data = { status: options.inspection ?? 'completed' }
        else if (operation === 'insert') {
          if ([...rows.values()].some((row) => row.audience === value.audience && ['pending', 'unknown'].includes(row.status))) error = { code: '23505' }
          else rows.set(value.id, { ...value })
        } else if (operation === 'update') Object.assign(rows.get(filters.id), value)
        else if (filters.id) data = rows.get(filters.id) ?? null
        else data = [...rows.values()]
        return Promise.resolve({ data, error }).then(resolve)
      },
    }
    return query
  } }
  const modules = {
    'server-only': {},
    '@/lib/contractSaleHandoverTemplates': { handoverDraft, isHandoverTemplate },
    '@/lib/supabase': { getAdminSupabase: () => db },
    '@/lib/contractSales': {
      getAuthorizedSale: async () => { authorized++; if (options.denied) throw new ProductError('Not found'); return { status: options.status ?? 'completed', handover_at: options.noHandover ? null : '2026-10-24', commencement_date: '2026-10-24' } },
      loadSaleContext: async () => ({ product: { frequency: 'weekly' }, site: { address: '1 Example St' }, client: { email: options.clientEmail ?? 'client@example.com' }, cleaner: { email: 'cleaner@example.com' } }),
    },
    '@/lib/contractProducts': { ContractProductError: ProductError },
    '@/lib/contractSalePolicy': { normalizeInvoiceEmail: (value) => typeof value === 'string' && value.includes('@') ? value : null },
    '@/lib/richEmailServer': { parseRichEmailContent, richEmailFingerprint },
    '@/lib/richEmailContent': { plainTextToEmailHtml },
    '@/lib/email': { EmailProviderRejectedError: Rejected, sendEmailOrThrow: async (payload) => { sends++; if (options.delivery === 'unknown') throw new Error('timeout'); if (options.delivery === 'failed') throw new Rejected(); assert.equal(payload.to, options.expectedRecipient ?? 'client@example.com'); return { id: 'provider-1' } } },
    '@/lib/auditLog': { writeAuditLogStrict: async () => {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((id) => modules[id] ?? require(id), module, module.exports)
  const actor = { id: 'staff', email: 'staff@example.com', displayName: 'Agent', phone: '', jobTitle: '' }
  return { run: (input) => module.exports.contractSaleFollowup(actor, input), rows, sends: () => sends, authorized: () => authorized }
}
const draft = { saleId: 'sale', audience: 'client', subject: 'Follow up', body: 'Hello', requestId: '11111111-1111-4111-8111-111111111111' }

test('follow-up templates cover both audiences without operational pricing', () => {
  assert.equal(FOLLOWUP_TEMPLATES.filter((t) => t.audience === 'client').length, 4)
  assert.equal(FOLLOWUP_TEMPLATES.filter((t) => t.audience === 'cleaner').length, 3)
  assert.match(followupDraft('first-clean', 'Alex', '1 Test St').body, /Hi Alex,[\s\S]*1 Test St/)
  assert.throws(() => followupDraft('missing', '', ''))
})
test('preview resolves saved recipient and sanitizes HTML', async () => {
  const h = harness()
  const preview = await h.run({ ...draft, action: 'followup.preview', recipient: 'wrong@example.com', bodyHtml: '<p>Hello</p><script>alert(1)</script>' })
  assert.equal(preview.to, 'client@example.com')
  assert.doesNotMatch(preview.html, /<script/)
  assert.match(preview.html, /Secure Cleaning/)
  assert.equal(h.sends(), 0)
})
test('all actions authorize the sale, including history', async () => {
  for (const action of ['followup.history', 'followup.preview', 'followup.send']) {
    const h = harness({ denied: true })
    await assert.rejects(h.run({ ...draft, action }), /Not found/)
    assert.equal(h.sends(), 0)
  }
})
test('inspection is required but completed handovers can send', async () => {
  await assert.rejects(harness({ inspection: 'scheduled' }).run({ ...draft, action: 'followup.preview' }), /Complete the inspection/)
  await assert.rejects(harness({ status: 'cancelled' }).run({ ...draft, action: 'followup.preview' }), /active sale/)
  assert.ok((await harness().run({ ...draft, action: 'followup.preview' })).fingerprint)
})
test('send rejects edited or stale previews', async () => {
  const h = harness()
  const preview = await h.run({ ...draft, action: 'followup.preview' })
  await assert.rejects(h.run({ ...draft, subject: 'Changed', action: 'followup.send', fingerprint: preview.fingerprint }), /Preview it again/)
  assert.equal(h.sends(), 0)
})
test('successful retries do not resend and history retains the snapshot', async () => {
  const h = harness()
  const preview = await h.run({ ...draft, action: 'followup.preview' })
  const send = { ...draft, action: 'followup.send', fingerprint: preview.fingerprint }
  await h.run(send); await h.run(send)
  assert.equal(h.sends(), 1)
  const history = await h.run({ ...draft, action: 'followup.history' })
  assert.equal(history.history[0].html, preview.html)
  assert.equal(history.history[0].status, 'sent')
})
test('uncertain delivery blocks both retries and new send IDs', async () => {
  const h = harness({ delivery: 'unknown' })
  const preview = await h.run({ ...draft, action: 'followup.preview' })
  const send = { ...draft, action: 'followup.send', fingerprint: preview.fingerprint }
  await assert.rejects(h.run(send), /uncertain/)
  await assert.rejects(h.run(send), /already been attempted/)
  await assert.rejects(h.run({ ...send, requestId: '22222222-2222-4222-8222-222222222222' }), /previous send/)
  assert.equal(h.sends(), 1)
})
test('provider rejection is retained as failed', async () => {
  const h = harness({ delivery: 'failed' })
  const preview = await h.run({ ...draft, action: 'followup.preview' })
  await assert.rejects(h.run({ ...draft, action: 'followup.send', fingerprint: preview.fingerprint }), /rejected/)
  assert.equal(h.rows.get(draft.requestId).status, 'failed')
})


test('cleaner sends use the saved cleaner address and client previews cannot cross audiences', async () => {
  const h = harness({ expectedRecipient: 'cleaner@example.com' })
  const clientPreview = await h.run({ ...draft, action: 'followup.preview' })
  await assert.rejects(h.run({ ...draft, audience: 'cleaner', action: 'followup.send', fingerprint: clientPreview.fingerprint }), /Preview it again/)
  const cleanerDraft = { ...draft, audience: 'cleaner' }
  const preview = await h.run({ ...cleanerDraft, action: 'followup.preview' })
  assert.equal(preview.to, 'cleaner@example.com')
  await h.run({ ...cleanerDraft, action: 'followup.send', fingerprint: preview.fingerprint })
  assert.equal(h.sends(), 1)
})
test('invalid recipients, audience and subject are rejected before sending', async () => {
  await assert.rejects(harness({ clientEmail: '' }).run({ ...draft, action: 'followup.preview' }), /valid email/)
  await assert.rejects(harness().run({ ...draft, audience: 'staff', action: 'followup.preview' }), /client or cleaner/)
  await assert.rejects(harness().run({ ...draft, subject: 'Bad\r\nHeader', action: 'followup.preview' }), /line breaks/)
})


test('handover templates merge only contact and service details for each audience', () => {
  const details = { client: { contact_name: 'Anna Example', business_name: 'Example Client', email: 'client@example.com', phone: '0400000001' }, cleaner: { contact_name: 'Sam Not provided', business_name: 'Example Cleaner', email: 'cleaner@example.com', phone: '0400000002' }, site: { site_name: 'Office', address: '1 Example St' }, product: { frequency: 'weekly', client_price_per_visit_ex_gst_cents: 16000 }, commencedOn: '2026-10-24' }
  const client = handoverDraft('client', details)
  assert.match(client.body, /Hi Anna,/)
  assert.match(client.body, /Example Cleaner/)
  assert.match(client.body, /cleaner@example.com/)
  const cleaner = handoverDraft('cleaner', details)
  assert.match(cleaner.body, /Hi Sam,/)
  assert.match(cleaner.body, /client@example.com/)
  assert.match(cleaner.body, /\$160.00 excluding GST/)
  assert.doesNotMatch(cleaner.body, /6 months|pro-rata|28th|Not provided/)
  const missing = handoverDraft('client', { ...details, cleaner: {}, product: {}, site: null, commencedOn: null })
  assert.doesNotMatch(missing.body, /undefined|null|\$0/)
})
test('handover template preparation is read-only and requires completed handover and matching audience', async () => {
  const input = { ...draft, templateId: 'handover-client', action: 'followup.template' }
  for (const options of [{ status: 'active_payment_plan' }, { noHandover: true }]) await assert.rejects(harness(options).run(input), /Complete the sale and handover/)
  await assert.rejects(harness().run({ ...input, audience: 'cleaner' }), /matching recipient/)
  await assert.rejects(harness({ denied: true }).run(input), /Not found/)
  const h = harness(); const generated = await h.run(input)
  assert.ok(generated.detailsFingerprint)
  assert.equal(h.sends(), 0); assert.equal(h.rows.size, 0)
  await assert.rejects(h.run({ ...input, action: 'followup.preview' }), /details changed/)
  const composed = { ...draft, templateId: 'handover-client', detailsFingerprint: generated.detailsFingerprint, subject: generated.subject, body: generated.body }
  const preview = await h.run({ ...composed, action: 'followup.preview' })
  assert.equal(h.sends(), 0)
  await h.run({ ...composed, action: 'followup.send', fingerprint: preview.fingerprint })
  assert.equal(h.sends(), 1)
})
