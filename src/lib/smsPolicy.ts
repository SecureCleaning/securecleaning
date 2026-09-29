/** Pure SMS policy shared by preview, dispatch and tests. No credentials here. */
export const DEFAULT_SMS_TEMPLATE = "Secure Cleaning: We've emailed your quote. Please check your inbox and junk folder. Can't find it? Reply here and we'll help. Reply STOP to opt out."
export const SMS_FIELDS = ['first_name', 'client_name', 'quote_reference'] as const
export const SMS_TERMINAL_QUOTE_STATES = ['accepted', 'withdrawn', 'deleted', 'superseded', 'expired', 'declined', 'cancelled']
export function normalizeSmsMobile(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value)) return null
  let number = value.replace(/[^\d]/g, '')
  if (number.startsWith('04')) number = `61${number.slice(1)}`
  return /^614\d{8}$/.test(number) ? number : null
}
export function smsTimeZone(city: unknown): string | null {
  return city === 'sydney' ? 'Australia/Sydney' : city === 'melbourne' ? 'Australia/Melbourne' : null
}
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return { day: parts.find(p => p.type === 'weekday')!.value, hour: Number(parts.find(p => p.type === 'hour')!.value) }
}
export function inSmsSendingHours(date: Date, timeZone: string): boolean {
  const p = localParts(date, timeZone)
  return !['Sat', 'Sun'].includes(p.day) && p.hour >= 9 && p.hour < 18
}
/** Iterate UTC minutes to avoid DST arithmetic and Friday/weekend boundary mistakes. */
export function nextSmsSendTime(date: Date, timeZone: string): Date {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid SMS time')
  if (inSmsSendingHours(date, timeZone)) return date
  const next = new Date(Math.ceil(date.getTime() / 60_000) * 60_000)
  for (let i = 0; i < 5 * 24 * 60; i++, next.setUTCMinutes(next.getUTCMinutes() + 1)) {
    if (inSmsSendingHours(next, timeZone)) return next
  }
  throw new Error('Cannot determine SMS sending time')
}
export function renderSms(template: string, fields: Record<string, string>): string {
  if (!template.trim() || template.length > 1500) throw new Error('Enter a template of up to 1500 characters.')
  const rendered = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, field: string) => {
    if (!(SMS_FIELDS as readonly string[]).includes(field)) throw new Error(`Unsupported SMS field: ${field}`)
    return (fields[field] || '').replace(/[\r\n{}]/g, ' ').trim()
  })
  // Disallow provider-side substitutions: our preview is the actual text sent.
  if (/[{}]/.test(rendered)) throw new Error('Use only the supported SMS fields.')
  if (!/secure cleaning/i.test(rendered) || !/reply STOP to opt out\.?\s*$/i.test(rendered)) throw new Error('Include Secure Cleaning and end with Reply STOP to opt out.')
  return rendered.trim()
}
const GSM = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'))
const GSM_EXT = new Set(Array.from('\f^{}\\[~]|€'))
export function smsSegments(message: string) {
  const unicode = Array.from(message).some(c => !GSM.has(c) && !GSM_EXT.has(c))
  const units = unicode ? message.length : Array.from(message).reduce((sum, c) => sum + (GSM_EXT.has(c) ? 2 : 1), 0)
  return { encoding: unicode ? 'UCS-2' : 'GSM-7', units, segments: units <= (unicode ? 70 : 160) ? 1 : Math.ceil(units / (unicode ? 67 : 153)) }
}
export function isSmsOptOut(text: string): boolean {
  return /\b(stop|unsubscribe|opt[ -]?out|remove me|do not (text|contact|message)|don'?t (text|contact|message)|no more (texts|messages))\b/i.test(text)
}
export type SmsSettings = { auto_enabled: boolean; delay_minutes: number; template: string; alert_email: string; low_credit_threshold: number; credit_price_cents: number; max_parts: number }
export type SmsJob = {
  id: string; purpose: string; entity_type: string; entity_ref: string; quote_ref: string | null; document_version: number | null;
  email_attempt_id: string | null; mobile: string; message: string; time_zone: string; due_at: string; expires_at: string; status: string;
  reason: string | null; created_at: string; submitted_at: string | null; provider_id: string | null; credits: number | null;
  first_attempt_at: string | null; attempt_count: number; provider_scope: string | null; request_payload: Record<string, unknown> | null;
  lease_token: string | null; cancel_requested: boolean; automatic: boolean; fields: Record<string, string>; template: string;
}
