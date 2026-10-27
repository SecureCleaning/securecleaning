import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCrmCleaningPreferences } from '../src/lib/crmCleaningPreferences.ts'
import { buildCrmQuoteDraftInputs } from '../src/lib/clientCrmQuoteDraft.ts'

test('new appointments require a frequency choice and default cleaning to after hours', () => {
  assert.deepEqual(resolveCrmCleaningPreferences(), { frequency: '', timePreference: 'after_hours' })
  for (const frequency of ['weekly', 'fortnightly', '2x_week', '3x_week', 'daily', '7x_week', 'monthly']) {
    assert.deepEqual(resolveCrmCleaningPreferences({ frequency, timePreference: 'weekend' }), { frequency, timePreference: 'weekend' })
  }
})
test('recorded requirements take precedence and missing details fall back to opportunity selections', () => {
  assert.deepEqual(resolveCrmCleaningPreferences({ frequency: '2x_week', timePreference: 'business_hours' }, { frequency: 'weekly', timePreference: 'after_hours' }), { frequency: '2x_week', timePreference: 'business_hours' })
  assert.deepEqual(resolveCrmCleaningPreferences({}, { frequency: 'fortnightly', timePreference: 'weekend' }), { frequency: 'fortnightly', timePreference: 'weekend' })
})
test('quote draft inherits opportunity preferences but preserves explicit booking preferences', () => {
  const base = { businessName: 'Test', contactName: 'Test', email: 'test@example.com', phone: '', address: '', suburb: '', postcode: '2000', city: 'sydney', cleaningFrequency: '3x_week', cleaningTimePreference: 'weekend' }
  assert.equal(buildCrmQuoteDraftInputs(base).frequency, '3x_week')
  assert.equal(buildCrmQuoteDraftInputs(base).timePreference, 'weekend')
  const withBooking = buildCrmQuoteDraftInputs({ ...base, bookingInputs: { frequency: 'fortnightly', timePreference: 'business_hours' } })
  assert.equal(withBooking.frequency, 'fortnightly')
  assert.equal(withBooking.timePreference, 'business_hours')
})
