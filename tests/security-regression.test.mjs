import test from 'node:test'
import assert from 'node:assert/strict'

import { NextRequest } from 'next/server'
import {
  rejectCrossOriginMutation,
  rejectLargePayload,
  validatePublicSubmission,
} from '../src/lib/abuseProtection.ts'
import {
  hashAvailabilityAccessCode,
  verifyAvailabilityAccessCode,
} from '../src/lib/availabilityAccessCode.ts'

test('availability access codes verify only against their exact hash', () => {
  const hash = hashAvailabilityAccessCode('  NSW-Agent-Secret  ')

  assert.equal(verifyAvailabilityAccessCode('NSW-Agent-Secret', hash), true)
  assert.equal(verifyAvailabilityAccessCode('wrong-secret', hash), false)
  assert.equal(verifyAvailabilityAccessCode('', hash), false)
})

test('public submissions reject honeypots and missing acceptable-use consent', async () => {
  const honeypotResponse = validatePublicSubmission({ website: 'https://bot.example' })
  assert.equal(honeypotResponse?.status, 400)
  assert.deepEqual(await honeypotResponse.json(), {
    success: false,
    error: 'Submission rejected.',
  })

  const consentResponse = validatePublicSubmission({}, { requireAcceptableUse: true })
  assert.equal(consentResponse?.status, 400)
  assert.match((await consentResponse.json()).error, /genuine authorised enquiry/)
})

test('public submissions reject stale or automated form timings', () => {
  const response = validatePublicSubmission(
    { formStartedAt: Date.now() - 1_000 },
    { minElapsedMs: 5_000 }
  )

  assert.equal(response?.status, 400)
})

test('mutation protection rejects cross-origin requests and oversized bodies', async () => {
  const crossOriginRequest = new NextRequest('https://securecleaning.com.au/api/quote', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
  })
  const originResponse = rejectCrossOriginMutation(crossOriginRequest)
  assert.equal(originResponse?.status, 403)

  const largeRequest = new NextRequest('https://securecleaning.com.au/api/quote', {
    method: 'POST',
    headers: { 'content-length': '1001' },
  })
  const payloadResponse = rejectLargePayload(largeRequest, 1000)
  assert.equal(payloadResponse?.status, 413)
  assert.match((await payloadResponse.json()).error, /too large/)
})
