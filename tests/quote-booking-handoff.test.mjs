import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const root = fileURLToPath(new URL('..', import.meta.url))
const { createQuoteBookingHandoffToken, verifyQuoteBookingHandoffToken } = await import('../src/lib/quoteBookingAccess.ts')
const { buildBookingPrefillFromQuoteInputs } = await import('../src/lib/quoteBookingPrefill.ts')
const { buildQuoteEditPrefillFromQuoteInputs } = await import('../src/lib/quoteBookingPrefill.ts')

test('legacy signed and malformed booking tokens are rejected before database access', async () => {
  for (const token of [null, '', 'v1.1234567890.' + 'a'.repeat(43), 'bad']) {
    assert.equal(await verifyQuoteBookingHandoffToken('SC-20260817-TEST', token), false)
  }
})

test('authorized booking prefill contains customer and premises fields but not quote pricing', () => {
  const prefill = buildBookingPrefillFromQuoteInputs('SC-20260817-TEST', {
    businessName: 'Example Co', contactName: 'Jane Client', email: 'jane@example.com', phone: '0400000000',
    address: '1 Example Street', city: 'sydney', suburb: 'Alexandria', postcode: '2015',
    premisesType: 'office', floorArea: 167, frequency: 'fortnightly', timePreference: 'after_hours',
  })

  assert.equal(prefill.businessName, 'Example Co')
  assert.equal(prefill.contactName, 'Jane Client')
  assert.equal(prefill.suburb, 'Alexandria')
  assert.equal(prefill.postcode, '2015')
  assert.equal('result' in prefill, false)
  assert.equal('totalLow' in prefill, false)
})

test('authorized quote edit prefill restores room selections and quote-only premises fields', () => {
  const roomScope = [
    { id: 'room-bathroom', type: 'bathroom', label: 'General bathroom / amenities', quantity: 2, moppingRequired: true, isCustom: false },
    { id: 'room-meeting', type: 'meeting_room', label: 'Meeting rooms', quantity: 3, moppingRequired: false, isCustom: false },
  ]
  const prefill = buildQuoteEditPrefillFromQuoteInputs({
    floors: 2,
    flooringType: 'mixed',
    meetingRooms: 3,
    roomScope,
    heardAboutUs: 'Internal workflow testing',
    acceptableUseAccepted: true,
    formStartedAt: 123,
    website: 'must-not-carry',
  })

  assert.deepEqual(prefill.roomScope, roomScope)
  assert.equal(prefill.floors, 2)
  assert.equal(prefill.flooringType, 'mixed')
  assert.equal(prefill.meetingRooms, 3)
  assert.equal(prefill.heardAboutUs, 'Internal workflow testing')
  assert.equal('acceptableUseAccepted' in prefill, false)
  assert.equal('formStartedAt' in prefill, false)
  assert.equal('website' in prefill, false)
})

test('private booking prefill route is token-protected and the public quote endpoint remains minimized', () => {
  const route = readFileSync(`${root}/src/app/api/quote/[ref]/booking-prefill/route.ts`, 'utf8')
  const publicRoute = readFileSync(`${root}/src/app/api/quote/[ref]/route.ts`, 'utf8')
  const bookingForm = readFileSync(`${root}/src/components/booking/BookingForm.tsx`, 'utf8')
  const quoteForm = readFileSync(`${root}/src/components/quote/QuoteForm.tsx`, 'utf8')
  const quoteResult = readFileSync(`${root}/src/components/quote/QuoteResultView.tsx`, 'utf8')
  const quoteSession = readFileSync(`${root}/src/lib/quoteSession.ts`, 'utf8')
  const email = readFileSync(`${root}/src/lib/email.ts`, 'utf8')
  const scopePage = readFileSync(`${root}/src/app/scope/[ref]/page.tsx`, 'utf8')

  assert.match(route, /verifyQuoteBookingHandoffToken/)
  assert.match(route, /rateLimit/)
  assert.match(route, /buildBookingPrefillFromQuoteInputs/)
  assert.match(route, /buildQuoteEditPrefillFromQuoteInputs/)
  assert.match(publicRoute, /getPublicQuoteDocumentByRef/)
  assert.doesNotMatch(publicRoute, /getQuoteByRef/)
  assert.match(bookingForm, /booking-prefill\?handoff=/)
  assert.match(quoteForm, /booking-prefill\?handoff=/)
  assert.match(quoteForm, /payload\.quotePrefill/)
  assert.match(quoteResult, /quoteRef, handoff: bookingHandoffToken/)
  assert.match(quoteResult, /bookingHandoffToken \? \{ handoff: bookingHandoffToken \}/)
  assert.match(scopePage, /verifyQuoteBookingHandoffToken/)
  assert.match(scopePage, /\.\.\.\(handoff \? \{ handoff \} : \{\}\)/)
  assert.match(quoteSession, /storedResult\?\.quoteRef !== quoteRef/)
  assert.match(quoteSession, /quoteRef \? null : storedDraft/)
  assert.match(email, /createQuoteBookingHandoffToken/)
  assert.match(email, /href="\$\{onlineQuoteUrl\}"[^>]*>\s*View Quote Online/)
  assert.doesNotMatch(email, /href="\$\{SITE_URL\}\/quote\/\$\{quoteRef\}"/)
})

test('quote workflow destinations request a new browser tab without changing resend behavior', () => {
  const quoteResult = readFileSync(`${root}/src/components/quote/QuoteResultView.tsx`, 'utf8')
  const scopePage = readFileSync(`${root}/src/app/scope/[ref]/page.tsx`, 'utf8')
  const dashboard = readFileSync(`${root}/src/components/admin/AdminDashboard.tsx`, 'utf8')
  const email = readFileSync(`${root}/src/lib/email.ts`, 'utf8')

  for (const label of ['Book Site Inspection', 'View Scope of Works', 'Recalculate']) {
    assert.match(quoteResult, new RegExp(`target="_blank"[\\s\\S]{0,500}${label}`))
  }
  assert.match(scopePage, /target="_blank"[\s\S]{0,500}Book site inspection/)
  assert.match(dashboard, /href=\{`\/quote\/\$\{quote\.quote_ref\}`\}[\s\S]{0,200}target="_blank"/)
  assert.match(dashboard, /onClick=\{\(\) => handleQuoteResend\(quote\.quote_ref\)\}/)

  for (const destination of ['bookingUrl', 'onlineQuoteUrl', 'scopeUrl', 'finalQuoteUrl']) {
    assert.match(email, new RegExp(`href="\\$\\{${destination}\\}" target="_blank" rel="noopener noreferrer"`))
  }
})
