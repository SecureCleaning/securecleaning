import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  getAustralianLocalitySuggestions,
  getNominatimLocalitySuggestions,
} from '../src/lib/australianLocalities.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

test('Parramatta search returns the actual NSW suburb and postcode', () => {
  const [suggestion] = getAustralianLocalitySuggestions({ query: 'parramatta', state: 'NSW' })

  assert.deepEqual(suggestion, {
    suburb: 'Parramatta',
    postcode: '2150',
    city: 'Sydney',
    state: 'NSW',
  })
})

test('postcode search remains bounded to the selected state', () => {
  const suggestions = getAustralianLocalitySuggestions({ query: '3121', state: 'VIC' })

  assert.deepEqual(suggestions.map(({ suburb, postcode, state }) => ({ suburb, postcode, state })), [
    { suburb: 'Richmond', postcode: '3121', state: 'VIC' },
  ])
})

test('remote locality parsing does not substitute the metropolitan city for the suburb', () => {
  const suggestions = getNominatimLocalitySuggestions([{
    name: 'City of Parramatta Council',
    address: {
      city: 'Sydney',
      state: 'New South Wales',
      'ISO3166-2-lvl4': 'AU-NSW',
      postcode: '2150',
    },
  }], { query: 'parramatta', state: 'NSW' })

  assert.deepEqual(suggestions, [{
    suburb: 'Parramatta',
    postcode: '2150',
    city: 'Parramatta',
    state: 'NSW',
  }])
})

test('remote postcode results retain their locality and reject another state', () => {
  const results = [{
    name: '2150',
    address: {
      postcode: '2150',
      town: 'Parramatta',
      state: 'New South Wales',
      'ISO3166-2-lvl4': 'AU-NSW',
    },
  }]

  assert.equal(getNominatimLocalitySuggestions(results, { query: '2150', state: 'VIC' }).length, 0)
  assert.equal(getNominatimLocalitySuggestions(results, { query: '2150', state: 'NSW' })[0].suburb, 'Parramatta')
})

test('customer locality forms ask for state before address and suburb search', () => {
  const bookingForm = readFileSync(`${root}/src/components/booking/BookingForm.tsx`, 'utf8')
  const quoteStep = readFileSync(`${root}/src/components/quote/StepOne.tsx`, 'utf8')
  const addressSearch = readFileSync(`${root}/src/components/booking/AddressAutocomplete.tsx`, 'utf8')
  const localitySearch = readFileSync(`${root}/src/components/shared/LocalityAutocomplete.tsx`, 'utf8')

  assert.match(bookingForm, /label="State" options=\{stateOptions\} placeholder="Select state…"/)
  assert.ok(bookingForm.indexOf('label="State"') < bookingForm.indexOf('<AddressAutocomplete'))
  assert.match(bookingForm, /label: 'Victoria'/)
  assert.match(bookingForm, /label: 'New South Wales'/)
  assert.match(quoteStep, /label="State"/)
  assert.match(addressSearch, /Select a state first/)
  assert.match(localitySearch, /Select a state first/)
})
