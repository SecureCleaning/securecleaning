import { parseRichEmailContent, sanitizeRichEmailHtml } from '@/lib/richEmailServer'
import { applyEmailMergeFields, findUnsupportedEmailMergeFields } from '@/lib/emailMergeFields'
export const CLEANER_EMAIL_LIMIT = 50
export const CLEANER_EMAIL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class CleanerEmailError extends Error {}
export type CleanerEmailInput = { emails: string[]; subject: string; body: string; bodyHtml: string; bodyDocument: Record<string, unknown> | null; templateId: string | null }
export type CleanerEmailRecipient = { id: string; email: string; contact_name: string; first_name?: string | null; last_name?: string | null; business_name: string; city?: string | null; suburb?: string | null; state?: string | null }
export type CleanerEmailSender = { displayName: string; jobTitle: string; phone: string; email: string }
export type CleanerEmailPreview = { fingerprint: string; recipients: Array<{ id: string; email: string; name: string; subject: string; html: string }>; sender: CleanerEmailSender }
export type CleanerEmailResult = { recipients: Array<{ id: string; to_email: string; delivery_outcome: string; subject: string }>; duplicate: boolean }

export function parseCleanerEmailInput(value: unknown): CleanerEmailInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CleanerEmailError('Enter recipients, subject and message.')
  const input = value as Record<string, unknown>
  const raw = typeof input.emails === 'string' ? input.emails : ''
  if (raw.length > 5000) throw new CleanerEmailError('The recipient list is too long.')
  const emails = raw.split(/[,;\n]+/).map(email => email.trim().toLowerCase()).filter(Boolean)
  if (!emails.length || emails.length > CLEANER_EMAIL_LIMIT) throw new CleanerEmailError('Choose between 1 and 50 cleaner email addresses.')
  if (emails.some(email => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new CleanerEmailError('Enter valid email addresses, separated by commas or new lines.')
  if (new Set(emails).size !== emails.length) throw new CleanerEmailError('Remove duplicate email addresses before previewing.')
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!subject || subject.length > 240 || /[\r\n]/.test(subject)) throw new CleanerEmailError('Enter a subject of 1 to 240 characters on one line.')
  if (!body || body.length > 10000) throw new CleanerEmailError('Enter a message of 1 to 10,000 characters.')
  const templateId = input.templateId || null
  if (templateId !== null && (typeof templateId !== 'string' || !CLEANER_EMAIL_UUID.test(templateId))) throw new CleanerEmailError('Select a valid template.')
  const supported = new Set(['first_name', 'last_name', 'contact_name', 'business_name', 'city', 'suburb', 'state'])
  let rich
  try { rich = parseRichEmailContent(input, { maxText: 10000 }) }
  catch { throw new CleanerEmailError('Enter a valid formatted message.') }
  const allowed = new Set([...supported, 'name', 'company'])
  const unsupported = findUnsupportedEmailMergeFields(allowed, subject, rich.text, rich.html)
  if (unsupported.length) throw new CleanerEmailError(`Unsupported personalisation field: ${unsupported.join(', ')}`)
  return { emails: emails.sort(), subject, body: rich.text, bodyHtml: rich.html, bodyDocument: rich.document, templateId: templateId as string | null }

}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
export function personaliseCleanerEmail(value: string, cleaner: CleanerEmailRecipient, escapeValues = false) {
  const tokens: Record<string, string> = {
    first_name: cleaner.first_name || cleaner.contact_name.split(/\s+/)[0] || 'there',
    last_name: cleaner.last_name || '', contact_name: cleaner.contact_name,
    name: cleaner.contact_name, company: cleaner.business_name,
    business_name: cleaner.business_name, city: cleaner.city || '', suburb: cleaner.suburb || '', state: cleaner.state || '',
  }
  // Replace once: cleaner-supplied names cannot introduce executable merge fields.
  return applyEmailMergeFields(value, escapeValues ? Object.fromEntries(Object.entries(tokens).map(([key, text]) => [key, escapeHtml(text)])) : tokens)
}
export function renderCleanerEmail(input: CleanerEmailInput, cleaner: CleanerEmailRecipient, sender: CleanerEmailSender, unsubscribeUrl: string) {
  const subject = personaliseCleanerEmail(input.subject, cleaner).replace(/[\r\n]/g, ' ').slice(0, 240)
  const body = personaliseCleanerEmail(input.body, cleaner)
  const bodyHtml = sanitizeRichEmailHtml(personaliseCleanerEmail(input.bodyHtml, cleaner, true))
  const signature = ['Kind regards,', '', sender.displayName, sender.jobTitle, 'Secure Cleaning', sender.phone, sender.email].join('\n')
  const text = `${body}\n\n${signature}\n\nYou are receiving this update because you have an approved cleaner profile with Secure Cleaning.\nUnsubscribe from cleaner updates and job broadcasts: ${unsubscribeUrl}\nSecure Cleaning | securecleaning.com.au`
  const paragraphs = (value: string) => escapeHtml(value).split(/\n{2,}/).map(p => `<p style="margin:0 0 18px;line-height:1.65">${p.replace(/\n/g, '<br>')}</p>`).join('')
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f6f8;padding:24px 12px;color:#1a2744;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#1a2744;padding:28px 32px;border-bottom:4px solid #c69b2d"><div style="color:white;font-size:24px;font-weight:bold">SECURE CLEANING <span style="color:#d9b658;font-size:13px">AUS</span></div><div style="color:#dbe6ef;font-size:12px;margin-top:8px">Cleaner network updates</div></div><div style="padding:32px">${bodyHtml}<div style="border-top:1px solid #e2e8f0;padding-top:24px;margin-top:28px">${paragraphs(signature)}</div></div><div style="background:#f8fafc;padding:22px 32px;font-size:12px;color:#64748b;line-height:1.6">You are receiving this update because you have an approved cleaner profile with Secure Cleaning.<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#0f766e">Unsubscribe from cleaner updates and job broadcasts</a><br>Secure Cleaning | securecleaning.com.au</div></div></body></html>`
  return { subject, body, html, text }
}
