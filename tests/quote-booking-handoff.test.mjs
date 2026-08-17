import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const root = fileURLToPath(new URL('..', import.meta.url))
const { createQuoteBookingHandoffToken, verifyQuoteBookingHandoffToken } = await import('../src/lib/quoteBookingAccess.ts')
const { buildBookingPrefillFromQuoteInputs } = await import('../src/lib/quoteBookingPrefill.ts')

test('booking handoff tokens are quote-bound, tamper-resistant, and expire', () => {
  const now = Date.UTC(2026, 7, 17)
  const quoteRef = 'SC-20260817-TEST'
  const token = createQuoteBookingHandoffToken(quoteRef, now)

  assert.equal(verifyQuoteBookingHandoffToken(quoteRef, token, now), true)
  assert.equal(verifyQuoteBookingHandoffToken('SC-20260817-NOPE', token, now), false)
  assert.equal(verifyQuoteBookingHandoffToken(quoteRef, `${token.slice(0, -1)}x`, now), false)
  assert.equal(verifyQuoteBookingHandoffToken(quoteRef, token, now + 31 * 24 * 60 * 60 * 1000), false)
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
  assert.match(publicRoute, /getPublicQuoteDocumentByRef/)
  assert.doesNotMatch(publicRoute, /getQuoteByRef/)
  assert.match(bookingForm, /booking-prefill\?handoff=/)
  assert.match(quoteForm, /booking-prefill\?handoff=/)
  assert.match(quoteResult, /quoteRef, handoff: bookingHandoffToken/)
  assert.match(quoteResult, /bookingHandoffToken \? \{ handoff: bookingHandoffToken \}/)
  assert.match(scopePage, /isQuoteBookingHandoffToken/)
  assert.match(scopePage, /\.\.\.\(handoff \? \{ handoff \} : \{\}\)/)
  assert.match(quoteSession, /storedResult\?\.quoteRef !== quoteRef/)
  assert.match(quoteSession, /quoteRef \? null : storedDraft/)
  assert.match(email, /createQuoteBookingHandoffToken/)
  assert.match(email, /href="\$\{onlineQuoteUrl\}"[^>]*>Open Quote/)
  assert.doesNotMatch(email, /href="\$\{SITE_URL\}\/quote\/\$\{quoteRef\}"/)
})
