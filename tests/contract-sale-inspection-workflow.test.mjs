import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildContractSaleChecklistPdf } from '../src/lib/contractSaleChecklistPdf.ts'
import { renderContractSaleInspectionEmail } from '../src/lib/contractSaleInspectionEmail.ts'

const projectRoot = new URL('..', import.meta.url).pathname
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('both inspection confirmations brand the existing draft and show appointment details once', () => {
  const values = {
    client_first_name: 'Alex', cleaner_first_name: 'Casey', site_name: 'Office & Warehouse',
    inspection_date: '27 November 2026', inspection_time: '12:30 pm', inspection_duration: '60 minutes',
    inspection_location: '1 Example Street, <Sydney>', sender_name: 'Sam Agent',
  }
  const inductionHtml = '<p>Hi &lt;&lt;cleaner_first_name&gt;&gt;,</p><p>The client has confirmed the site induction for &lt;&lt;site_name&gt;&gt;.</p><p><strong>Date:</strong> &lt;&lt;inspection_date&gt;&gt;<br><strong>Time:</strong> &lt;&lt;inspection_time&gt;&gt;<br><strong>Duration:</strong> &lt;&lt;inspection_duration&gt;&gt;<br><strong>Location:</strong> &lt;&lt;inspection_location&gt;&gt;</p><p>A calendar invitation is attached.</p><p>Kind regards,<br>&lt;&lt;sender_name&gt;&gt;</p>'

  for (const kind of ['client', 'cleaner']) {
    const recipientField = `<<${kind}_first_name>>`
    const draft = {
      subject: 'Site induction - <<site_name>>',
      bodyText: `Hi ${recipientField},\n\nThe site induction is confirmed.\n\nDate: <<inspection_date>>\nTime: <<inspection_time>>\nDuration: <<inspection_duration>>\nLocation: <<inspection_location>>\n\nA calendar invitation is attached.\n\nKind regards,\n<<sender_name>>`,
      bodyHtml: kind === 'client' ? '' : inductionHtml,
      bodyDocument: { type: 'doc' },
    }
    const result = renderContractSaleInspectionEmail(kind, draft, values)
    assert.equal(result.subject, 'Site induction - Office & Warehouse')
    assert.equal(result.bodyDocument, draft.bodyDocument)
    assert.match(result.html, /<title>Site induction - Office &amp; Warehouse<\/title>/)
    assert.match(result.html, /#1a2744[\s\S]*Site visit confirmed/)
    assert.match(result.html, /Secure Cleaning website/)
    assert.match(result.bodyHtml, /role="presentation"[^>]+#f0fdf4[\s\S]*12:30 pm[\s\S]*60 minutes[\s\S]*&lt;Sydney&gt;/)
    for (const item of ['Hi ', '27 November 2026', '1 Example Street', 'Sam Agent', 'A calendar invitation is attached.']) {
      assert.equal(result.html.split(item).length, 2)
      assert.equal(result.bodyText.split(item).length, 2)
    }
    assert.match(result.bodyText, new RegExp(`^Hi ${kind === 'client' ? 'Alex' : 'Casey'},`))
  }
})

test('inspection branding preserves custom message structure and availability wording', () => {
  const draft = {
    subject: 'Proposed timing',
    bodyText: 'Could we meet around 12:30 pm?',
    bodyHtml: '<h1>Proposed timing</h1><p>Could we meet around <em>{{inspection_time}}</em>?</p>',
    bodyDocument: null,
  }
  const values = { inspection_time: '12:30 pm' }
  const availability = renderContractSaleInspectionEmail('availability', draft, values)
  assert.match(availability.html, /Arrange a site visit/)
  assert.equal((availability.html.match(/<h1>/g) ?? []).length, 1)
  const confirmation = renderContractSaleInspectionEmail('cleaner', draft, values)
  assert.equal(confirmation.bodyHtml, '<h1>Proposed timing</h1><p>Could we meet around <em>12:30 pm</em>?</p>')
  assert.doesNotMatch(confirmation.html, /#f0fdf4/)
})

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
  const availabilityCalendar = source('src/lib/availabilityCalendar.ts')
  const feed = source('src/app/api/availability-agent/[assigneeId]/feed/route.ts')

  assert.match(domain, /actor\.availabilityAssigneeId/)
  assert.match(domain, /calendar_status: calendarStatus/)
  assert.match(domain, /direct calendar write was unavailable/)
  assert.match(domain, /inspectionIcs/)
  assert.doesNotMatch(domain, /getAvailableSlots/)
  assert.match(calendar, /upsertContractSaleInspectionEvent/)
  assert.match(calendar, /sendUpdates: 'none'/)
  assert.match(domain, /subscription_feed/)
  assert.match(availabilityCalendar, /scheduled_by_staff_id/)
  assert.match(availabilityCalendar, /buildContractSaleInspectionEvents/)
  assert.match(feed, /event\.kind === 'sale_inspection'/)
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
