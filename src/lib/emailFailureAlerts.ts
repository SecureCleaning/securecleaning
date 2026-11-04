import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from './supabase'

type FailureOutcome = 'not_sent' | 'provider_rejected' | 'uncertain'
type Failure = {
  payload: Record<string, unknown>
  outcome: FailureOutcome
  code: string
  idempotencyKey?: string
}

const descriptions: Record<FailureOutcome, string> = {
  not_sent: 'The email could not be prepared or the email service was not configured. It was not sent by this attempt.',
  provider_rejected: 'The email service rejected this sending attempt.',
  uncertain: 'Delivery is uncertain. The email service may already have accepted this message. Check Resend before retrying to avoid sending it twice.',
}
const safeLine = (value: unknown, limit: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : ''
const mailbox = (value: string) => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)

export function emailFailureRecord(failure: Failure, now = new Date()) {
  const subject = safeLine(failure.payload.subject, 240) || '(no subject)'
  const recipients = ['to', 'cc', 'bcc'].flatMap(field => {
    const values = failure.payload[field]
    return (Array.isArray(values) ? values : [values]).filter((v): v is string => typeof v === 'string')
      .map(value => safeLine(value, 254)).filter(Boolean)
  }).slice(0, 10).sort()
  const code = /^[a-z0-9_]{1,80}$/.test(failure.code) ? failure.code : 'email_send_failed'
  // Hash the logical send identity; never persist capabilities/idempotency tokens.
  const identity = failure.idempotencyKey || JSON.stringify([now.toISOString().slice(0, 10), subject, recipients, safeLine(failure.payload.from, 254)])
  const dedupe_key = createHash('sha256').update(JSON.stringify([identity, failure.outcome, code])).digest('hex')
  return {
    dedupe_key,
    outcome: failure.outcome,
    failure_code: code,
    alert_text: [
      'An outgoing Secure Cleaning email needs attention.', '',
      `First detected: ${now.toISOString()}`, `Subject: ${subject}`,
      `Intended recipients: ${recipients.join(', ') || '(unavailable)'}`, '',
      descriptions[failure.outcome], `Failure category: ${code.replace(/_/g, ' ')}`, '',
      'Review the related record in Secure Cleaning and provider activity at https://resend.com/emails.',
      'Other messages in the same workflow may have succeeded. Check each recipient before taking action.',
      'This alert does not resend the original email or change any booking or payment.',
    ].join('\n'),
  }
}

/** Best-effort reporting must never replace the original send error or retry its message. */
export async function reportEmailFailure(failure: Failure) {
  if (process.env.VERCEL_ENV !== 'production') return
  try {
    const db = getAdminSupabase()
    const saved = await db.from('email_failure_alerts').upsert(emailFailureRecord(failure), {
      onConflict: 'dedupe_key', ignoreDuplicates: true,
    }).select('id').maybeSingle()
    if (saved.error) throw saved.error
    if (saved.data?.id) await deliverEmailFailureAlerts(saved.data.id)
  } catch {
    // No raw provider error or payload in logs: these may contain credentials/customer content.
    console.error('[email-alerts] Owner notification could not be recorded or delivered; review email service health.')
  }
}

/** Called immediately on failure and by the existing authenticated notification worker. */
export async function deliverEmailFailureAlerts(id?: string) {
  if (process.env.VERCEL_ENV !== 'production' || !process.env.RESEND_API_KEY) return
  const recipient = process.env.ADMIN_EMAIL?.trim() || 'info@securecleaning.com.au'
  if (!mailbox(recipient)) {
    console.error('[email-alerts] Owner notification address needs configuration; alerts remain queued.')
    return
  }
  const db = getAdminSupabase()
  const claimed = await db.rpc('claim_email_failure_alerts', { p_recipient: recipient, p_limit: id ? 1 : 3, p_id: id || null })
  if (claimed.error) throw claimed.error
  for (const alert of claimed.data || []) {
    try {
      // Deliberately bypass sendEmailOrThrow: alert failures must never trigger new alerts.
      // The payload and owner address remain frozen for all retries under this key.
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `email-failure-alert/${alert.id}` },
        body: JSON.stringify({ from: 'Secure Cleaning <quotes@securecleaning.com.au>', to: [alert.recipient], subject: 'Secure Cleaning: email sending needs attention', text: alert.alert_text }),
      })
      const result = await response.json()
      if (response.ok && typeof result.id === 'string' && result.id) {
        const saved = await db.from('email_failure_alerts').update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: result.id, lease_token: null, lease_until: null })
          .eq('id', alert.id).eq('lease_token', alert.lease_token)
        if (saved.error) throw saved.error
      }
    } catch {
      // Retain the queued alert and identical key. The next worker retries it after five minutes.
    }
  }
}
