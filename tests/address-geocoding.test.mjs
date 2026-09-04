import assert from 'node:assert/strict'
import test from 'node:test'

import { preserveTypedStreetNumber } from '../src/lib/addressGeocoding.ts'

test('address suggestions retain a typed street number when the provider returns only the road', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      'Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
      { road: 'Sunnyholt Road' },
    ),
    '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
  )
})

test('address suggestions do not duplicate a provider-supplied street number', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
      { house_number: '100', road: 'Sunnyholt Road' },
    ),
    '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
  )
})

test('a typed street number is not attached to an unrelated suggestion', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      'Sunnybank Road, Blacktown, Sydney, New South Wales, 2148',
      { road: 'Sunnybank Road' },
    ),
    'Sunnybank Road, Blacktown, Sydney, New South Wales, 2148',
  )
})
