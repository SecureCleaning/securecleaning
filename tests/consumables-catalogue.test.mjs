import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const {
  calculateConsumablePriceCents,
  slugifyConsumable,
} = await import('../src/lib/consumablesShared.ts')
const { parseConsumablesImportFile } = await import('../src/lib/consumablesImport.ts')
const { createDefaultFirmQuoteDraft, parseFirmQuoteDraft } = await import('../src/lib/quoteWorkflow.ts')
const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG } = await import('../src/lib/roomTypeConfig.ts')

const baseInputs = {
  businessName: 'Catalogue Test', contactName: 'Client', email: 'client@example.com', phone: '0400000000',
  city: 'melbourne', suburb: 'Richmond', postcode: '3121', premisesType: 'office', floorArea: 100,
  floors: 1, flooringType: 'mixed', frequency: 'weekly', timePreference: 'business_hours',
  addOns: { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false },
}

test('consumable pricing uses integer cents, default markup, and explicit overrides', () => {
  assert.equal(calculateConsumablePriceCents(4000, 2000), 4800)
  assert.equal(calculateConsumablePriceCents(4000, 2000, 2500), 5000)
  assert.equal(calculateConsumablePriceCents(4000, 2000, 2500, 5195), 5195)
  assert.equal(calculateConsumablePriceCents(-100, 2000), 0)
})

test('consumable slugs are stable and strip unsafe characters', () => {
  assert.equal(slugifyConsumable('  Sorbent Ultraslim TAD Hand Towel  '), 'sorbent-ultraslim-tad-hand-towel')
  assert.equal(slugifyConsumable('Soap <script>alert(1)</script>'), 'soap-script-alert-1-script')
})

test('CSV import previews structured products without saving or inventing final prices', async () => {
  const csv = [
    'Title,Description,Category,Supplier SKU,Pack size,Supplier cost,Markup %,Final price,Active',
    'Hand Soap,Blue hand soap,Soap and wash,SOAP-5L,5 litre container,34.80,20,,Yes',
    'Archived Towel,Test towel,Hand towel,TOWEL-1,16 packs,35,,50,No',
  ].join('\n')
  const file = new File([csv], 'catalogue.csv', { type: 'text/csv' })
  const preview = await parseConsumablesImportFile(file)

  assert.equal(preview.products.length, 2)
  assert.deepEqual(preview.warnings, [])
  assert.equal(preview.products[0].supplierCostCents, 3480)
  assert.equal(preview.products[0].markupOverrideBps, 2000)
  assert.equal(preview.products[0].finalPriceOverrideCents, null)
  assert.equal(preview.products[1].active, false)
  assert.equal(preview.products[1].finalPriceOverrideCents, 5000)
})

test('quote drafts default the catalogue link off and preserve an explicit selection', () => {
  const draft = createDefaultFirmQuoteDraft(baseInputs, DEFAULT_QUOTE_ROOM_TYPE_CONFIG)
  assert.equal(draft.includeConsumablesCatalogue, false)
  assert.equal(parseFirmQuoteDraft({ ...draft, includeConsumablesCatalogue: true }, baseInputs, DEFAULT_QUOTE_ROOM_TYPE_CONFIG).includeConsumablesCatalogue, true)
  assert.equal(parseFirmQuoteDraft({ ...draft, includeConsumablesCatalogue: 'true' }, baseInputs, DEFAULT_QUOTE_ROOM_TYPE_CONFIG).includeConsumablesCatalogue, false)
})

test('catalogue editing is manager-only and storage/table ACLs exclude browser roles', () => {
  for (const relative of [
    'src/app/api/admin/consumables/route.ts',
    'src/app/api/admin/consumables/import/route.ts',
    'src/app/api/admin/consumables/image/route.ts',
  ]) {
    const source = readFileSync(`${root}/${relative}`, 'utf8')
    assert.match(source, /isAuthorizedAdminRequest\(request, 'manager'\)/)
    assert.match(source, /rejectCrossOriginMutation/)
    assert.match(source, /rejectLargePayload/)
  }

  const migration = readFileSync(`${root}/supabase/consumables_catalogue_migration.sql`, 'utf8')
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.consumable_catalog_settings FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.consumable_products FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /allowed_mime_types/)
  assert.match(migration, /ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
})

test('public catalogue and quote links expose final prices only and open in a new tab', () => {
  const publicPage = readFileSync(`${root}/src/app/consumables/page.tsx`, 'utf8')
  const publicQuote = readFileSync(`${root}/src/components/quote/QuoteResultView.tsx`, 'utf8')
  const adminSend = readFileSync(`${root}/src/app/api/admin/quotes/[ref]/send/route.ts`, 'utf8')
  const agentSend = readFileSync(`${root}/src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts`, 'utf8')
  const email = readFileSync(`${root}/src/lib/email.ts`, 'utf8')

  assert.match(publicPage, /getPublicConsumablesCatalog/)
  assert.match(publicPage, /robots: \{ index: false, follow: false, noarchive: true \}/)
  assert.doesNotMatch(publicPage, /supplierCostCents|markupOverrideBps|supplierProductUrl/)
  assert.match(publicQuote, /href="\/consumables"[\s\S]*target="_blank"[\s\S]*rel="noopener noreferrer"/)
  assert.match(adminSend, /includeConsumablesCatalogue: finalQuote\.firmQuoteDraft\.includeConsumablesCatalogue/)
  assert.match(agentSend, /canAvailabilityAgentAccessQuote/)
  assert.match(agentSend, /includeConsumablesCatalogue: finalQuote\.firmQuoteDraft\.includeConsumablesCatalogue/)
  assert.match(email, /View Consumables Pricing/)
  assert.match(email, /target="_blank" rel="noopener noreferrer"/)
})
