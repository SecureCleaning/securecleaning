import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildContractSaleChecklistPdf } from '../src/lib/contractSaleChecklistPdf.ts'

const projectRoot = new URL('..', import.meta.url).pathname
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('inspection communications require previews and retain distinct client and cleaner records', () => {
  const domain = source('src/lib/contractSales.ts')
  const schedule = domain.slice(domain.indexOf('export async function scheduleContractSaleInspection'))
  const route = source('src/app/api/admin/contract-sales/route.ts')
  const panel = source('src/components/admin/ContractSaleInspectionPanel.tsx')

  assert.match(route, /inspection-email\.preview/)
  assert.match(route, /inspection-confirmations\.preview/)
  assert.match(route, /inspection-availability\.send/)
  assert.match(domain, /client_confirmation/)
  assert.match(domain, /cleaner_confirmation/)
  assert.match(domain, /previewFingerprint !== confirmationPreview\.fingerprint/)
  assert.ok(schedule.indexOf('const clientRequestId') < schedule.indexOf('sendEmailOrThrow({ from: process.env.FROM_EMAIL'))
  assert.match(panel, /Ask the client for availability/)
  assert.match(panel, /RichEmailEditor/)
  assert.match(panel, /Preview both confirmations/)
})

test('inspection scheduling writes to the sender calendar with an ICS fallback and bypasses public availability', () => {
  const domain = source('src/lib/contractSales.ts')
  const calendar = source('src/lib/googleCalendar.ts')

  assert.match(domain, /actor\.availabilityAssigneeId/)
  assert.match(domain, /calendar_status: calendarStatus/)
  assert.match(domain, /direct calendar write was unavailable/)
  assert.match(domain, /inspectionIcs/)
  assert.doesNotMatch(domain, /getAvailableSlots/)
  assert.match(calendar, /upsertContractSaleInspectionEvent/)
  assert.match(calendar, /sendUpdates: 'none'/)
})

test('inspection migration keeps message and completed-checklist history private and immutable', () => {
  const migration = source('supabase/contract_sale_inspection_communications_checklist_migration.sql')

  assert.match(migration, /contract_sale_inspection_messages/)
  assert.match(migration, /Inspection message history is immutable/)
  assert.match(migration, /Checklist upload history is immutable/)
  assert.match(migration, /Complete handover before uploading the checklist/)
  assert.match(migration, /contract-sale-checklists','contract-sale-checklists',FALSE/)
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
})

test('printable site checklist is a condensed one-page A4 sheet with an optional detailed scope', () => {
  const checklist = {
    inspectionDate: '2026-09-24', commencementDate: '2026-10-01', clientBusiness: 'Example Client', clientContact: 'Alex Client',
    clientPhone: '0400 000 001', clientEmail: 'client@example.com', cleanerBusiness: 'Example Cleaning', cleanerContact: 'Casey Cleaner',
    cleanerPhone: '0400 000 002', cleanerEmail: 'cleaner@example.com', siteName: 'Example Site', siteAddress: '7 Example Street, Sydney NSW 2000',
    cleaningDays: 'Monday, Wednesday, Friday', cleaningTime: '6:00 pm', frequency: 'Three times weekly', scopeSummary: 'Reception, offices, kitchen and amenities',
    initialClean: 'Required before commencement', accessHours: 'After 5:30 pm', accessInstructions: 'Meet the client at reception', inductionRequirements: 'Complete site induction',
    alarmSecurity: 'Code supplied at handover', keyholderDetails: 'Alex Client - 0400 000 001', lightSwitches: 'Reception panel', cleanerStorage: 'Ground floor cupboard',
    consumables: 'Client supplies paper products', waterAccess: 'Kitchen and cleaner room', rubbishDisposal: 'Rear loading area', cleanerBook: 'Stored in cleaner room',
    hazards: 'Wet floor near rear entry', equipment: 'Vacuum and mop stored onsite', keysItemsHandedOver: 'Two keys and one swipe card', notes: 'Photograph completed checklist after handover',
  }
  const scope = {
    formatVersion: 1, state: 'NSW', suburb: 'Sydney', premisesType: 'office', floorArea: 120, floors: 1,
    frequency: 'weekly', timePreference: 'after hours', estimatedHours: 3, summary: 'Office cleaning scope', selectedOptions: ['Consumables'],
    rooms: [{ type: 'office', label: 'Main office', description: 'Open-plan work area', quantity: 1, size: 80, floor: 1, tasks: [{ label: 'Vacuum floors', cadence: 'every_clean' }], selectedOptions: ['Empty bins'] }],
  }
  const pdf = buildContractSaleChecklistPdf({ saleCode: 'PS-2026-01002', productCode: 'C001008', checklist })
  const text = pdf.toString('latin1')

  assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
  assert.match(text, /\/Count 1/)
  assert.match(text, /Secure Cleaning/)
  assert.match(text, /NEW SITE CHECKLIST/)
  assert.match(text, /KEYS \/ ITEMS HANDED OVER/)
  assert.match(text, /SCOPE OF WORKS: NOT ATTACHED/)

  const withScope = buildContractSaleChecklistPdf({ saleCode: 'PS-2026-01002', productCode: 'C001008', checklist, includeScope: true, scope })
  const scopeText = withScope.toString('latin1')
  assert.match(scopeText, /\/Count 2/)
  assert.match(scopeText, /SCOPE OF WORKS: ATTACHED/)
  assert.match(scopeText, /SCOPE OF WORKS/)
  assert.match(scopeText, /Main office/)
})

test('checklist printing keeps the scope opt-in and server-derived', () => {
  const panel = source('src/components/admin/ContractSaleInspectionPanel.tsx')
  const route = source('src/app/api/admin/contract-sales/checklists/route.ts')
  const domain = source('src/lib/contractSales.ts')
  assert.match(panel, /Attach the full scope of works/)
  assert.match(panel, /includeScope=1/)
  assert.match(route, /searchParams\.get\('includeScope'\) === '1'/)
  assert.match(domain, /scope: context\.product\.cleaner_scope_snapshot/)
})
