import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { normalizeSmsMobile } from './smsPolicy'
const BASE = 'https://api.mobilemessage.com.au/v1/'
export class SmsProviderError extends Error {
  constructor(readonly code: string, readonly uncertain = false) { super(code) }
}
export function smsCredentialsConfigured() {
  return Boolean(process.env.MOBILE_MESSAGE_API_USERNAME && process.env.MOBILE_MESSAGE_API_PASSWORD && normalizeSmsMobile(process.env.MOBILE_MESSAGE_SENDER))
}
export function smsLiveEnabled() {
  return process.env.VERCEL_ENV === 'production' && process.env.SMS_LIVE_SEND_ENABLED === 'true'
}
export function providerScope() {
  return createHash('sha256').update(`${process.env.MOBILE_MESSAGE_API_USERNAME}:${process.env.MOBILE_MESSAGE_API_PASSWORD}`).digest('hex')
}
export async function mobileMessageRequest(path: string, method = 'GET', body?: unknown, key?: string): Promise<Record<string, unknown>> {
  if (!smsCredentialsConfigured()) throw new SmsProviderError('sms_not_configured')
  if (method !== 'GET' && !smsLiveEnabled()) throw new SmsProviderError('sms_live_sending_disabled')
  let response: Response
  try {
    response = await fetch(BASE + path, { method, cache: 'no-store', signal: AbortSignal.timeout(8_000), headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.MOBILE_MESSAGE_API_USERNAME}:${process.env.MOBILE_MESSAGE_API_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
  } catch { throw new SmsProviderError('provider_connection_unknown', method !== 'GET') }
  if (!response.ok) throw new SmsProviderError(`provider_http_${response.status}`, response.status >= 500 && method !== 'GET')
  try { return await response.json() } catch { throw new SmsProviderError('provider_response_unknown', method !== 'GET') }
}
export async function checkSmsConnection() {
  const [account, senders, webhooks] = await Promise.all([
    mobileMessageRequest('account'), mobileMessageRequest('senders'), mobileMessageRequest('webhooks'),
  ])
  const sender = normalizeSmsMobile(process.env.MOBILE_MESSAGE_SENDER)
  const approved = (senders.results as Array<{sender: string}> || []).some(s => normalizeSmsMobile(s.sender) === sender)
  const dedicated = (senders.results as Array<{sender: string; type: string}> || []).some(s => normalizeSmsMobile(s.sender) === sender && s.type === 'dedicated')
  const hooks = webhooks.webhooks as Record<string, unknown> | undefined
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://securecleaning.com.au').replace(/\/$/, '')
  const signed = webhooks.has_signing_secret === true && Boolean(process.env.MOBILE_MESSAGE_WEBHOOK_SECRET)
  const callbacks = hooks?.inbound === `${base}/api/sms/webhook` && hooks?.status === `${base}/api/sms/webhook`
  const balance = Number(account.credit_balance)
  if (!Number.isFinite(balance)) throw new SmsProviderError('provider_balance_unavailable')
  return { configured: true, approved, dedicated, signed, callbacks, sender, balance, ready: approved && dedicated && signed && callbacks, live: smsLiveEnabled(), checkedAt: new Date().toISOString() }
}
export function verifySmsWebhook(raw: string, timestamp: string | null, signature: string | null, secret = process.env.MOBILE_MESSAGE_WEBHOOK_SECRET || '', now = Date.now()) {
  if (!secret || !timestamp || !/^\d+$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
export function secureTokenMatch(provided: string, expected: string) {
  if (!expected) return false
  const a = Buffer.from(provided), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a,b)
}
