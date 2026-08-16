import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'
const TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60
const TOKEN_PATTERN = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/

function getSigningSecret() {
  const secret = process.env.QUOTE_BOOKING_HANDOFF_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) throw new Error('Missing quote booking handoff signing secret.')
  return secret
}

function signatureFor(quoteRef: string, expiresAt: number) {
  return createHmac('sha256', getSigningSecret())
    .update(`${TOKEN_VERSION}:${quoteRef}:${expiresAt}`)
    .digest('base64url')
}

export function createQuoteBookingHandoffToken(quoteRef: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS
  return `${TOKEN_VERSION}.${expiresAt}.${signatureFor(quoteRef, expiresAt)}`
}

export function isQuoteBookingHandoffToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function verifyQuoteBookingHandoffToken(quoteRef: string, token: unknown, now = Date.now()) {
  if (!isQuoteBookingHandoffToken(token)) return false
  const match = TOKEN_PATTERN.exec(token)
  if (!match) return false

  const expiresAt = Number(match[1])
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(now / 1000)) return false

  const supplied = Buffer.from(match[2], 'base64url')
  const expected = Buffer.from(signatureFor(quoteRef, expiresAt), 'base64url')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
