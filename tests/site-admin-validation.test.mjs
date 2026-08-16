import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { validateSitePayload } from '../src/lib/sitePayloadValidation.ts'

const SITE_ID = '9d724f50-d680-4f2c-b317-1af83c97443a'
const CLIENT_ID = '01569ea2-ae25-4d73-9267-761bddba2952'

test('site creation trims and allowlists a valid payload', () => {
  const result = validateSitePayload({
    address: '  10 Main Street  ',
    city: 'melbourne',
    siteName: '  Main office  ',
    premisesType: 'office',
    floorArea: 0,
    accessNotes: '  Reception has the key.  ',
    isActive: false,
    clientId: `  ${CLIENT_ID}  `,
    unexpected: 'must not reach the data layer',
  }, 'create')

  assert.deepEqual(result, {
    success: true,
    payload: {
      siteName: 'Main office',
      clientId: CLIENT_ID,
      address: '10 Main Street',
      accessNotes: 'Reception has the key.',
      city: 'melbourne',
      premisesType: 'office',
      floorArea: 0,
      isActive: false,
    },
  })
})

test('site creation requires a bounded address and valid city', () => {
  assert.deepEqual(validateSitePayload({ address: '   ', city: 'melbourne' }, 'create'), {
    success: false,
    error: 'address is required.',
  })
  assert.deepEqual(validateSitePayload({ address: 'Valid', city: 'brisbane' }, 'create'), {
    success: false,
    error: 'city is invalid.',
  })
  assert.equal(validateSitePayload({ address: 'x'.repeat(501), city: 'sydney' }, 'create').success, false)
})

test('site payload validates enumerations, numbers, strings, and booleans', () => {
  for (const payload of [
    { address: 'Valid', city: 'sydney', premisesType: 'house' },
    { address: 'Valid', city: 'sydney', floorArea: Number.NaN },
    { address: 'Valid', city: 'sydney', floorArea: -1 },
    { address: 'Valid', city: 'sydney', floorArea: 10_000_001 },
    { address: 'Valid', city: 'sydney', accessNotes: 'x'.repeat(4_001) },
    { address: 'Valid', city: 'sydney', isActive: 'yes' },
    { address: 'Valid', city: 'sydney', clientId: null },
    { address: 'Valid', city: 'sydney', clientId: 'not-a-uuid' },
  ]) {
    assert.equal(validateSitePayload(payload, 'create').success, false)
  }
})

test('site updates require a UUID siteId and validate only supplied fields', () => {
  assert.deepEqual(validateSitePayload({ siteId: `  ${SITE_ID}  `, suburb: '  Richmond ', unknown: true }, 'update'), {
    success: true,
    siteId: SITE_ID,
    payload: { suburb: 'Richmond' },
  })
  assert.equal(validateSitePayload({ siteId: ' ', suburb: 'Richmond' }, 'update').success, false)
  assert.equal(validateSitePayload({ siteId: 'site-123', suburb: 'Richmond' }, 'update').success, false)
  assert.equal(validateSitePayload({ siteId: '9d724f50-d680-4f2c-b317', suburb: 'Richmond' }, 'update').success, false)
  assert.equal(validateSitePayload({ siteId: SITE_ID, address: ' ' }, 'update').success, false)
  assert.equal(validateSitePayload({ siteId: SITE_ID, city: '' }, 'update').success, false)
})

test('site updates reject siteId-only and unknown-only payloads', () => {
  assert.deepEqual(validateSitePayload({ siteId: SITE_ID }, 'update'), {
    success: false,
    error: 'Provide at least one site field to update.',
  })
  assert.equal(validateSitePayload({ siteId: SITE_ID, unexpected: true }, 'update').success, false)
})

test('site admin route keeps manager authorization and wires mutation guards and validation', () => {
  const source = readFileSync(new URL('../src/app/api/admin/sites/route.ts', import.meta.url), 'utf8')

  assert.equal((source.match(/isAuthorizedAdminRequest\(request, ['"]manager['"]\)/g) ?? []).length, 2)
  assert.equal((source.match(/rejectCrossOriginMutation\(request\)/g) ?? []).length, 2)
  assert.equal((source.match(/rejectLargePayload\(request, MAX_SITE_PAYLOAD_BYTES\)/g) ?? []).length, 2)
  assert.match(source, /validateSitePayload\(body, ['"]create['"]\)/)
  assert.match(source, /validateSitePayload\(body, ['"]update['"]\)/)
  assert.match(source, /status: 400/)
})
