export const CRM_FOLLOW_UP_TEMPLATE_ID = 'bd790bc4-7b27-4c60-a348-2050b9f85702'

export function crmFollowUpSubject(subject: string) {
  return (/^re\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`).slice(0, 240)
}

type OriginalEmail = {
  opportunity_id: string; contact_id: string; to_email: string; status: string
  sent_at: string | null; subject_snapshot: string; body_snapshot: string
  signature_snapshot: string; sender_name: string; from_email: string
}

export function buildCrmOriginalEmailQuote(original: OriginalEmail | null, opportunityId: string, contactId: string, recipient: string) {
  if (!original || original.opportunity_id !== opportunityId || original.contact_id !== contactId
    || original.to_email.trim().toLowerCase() !== recipient.trim().toLowerCase()
    || original.status !== 'sent' || !original.sent_at || !Number.isFinite(Date.parse(original.sent_at))) {
    throw new Error('Choose a successfully sent email for this client and recipient. If their email address has changed, compose a new email instead.')
  }
  if (!original.body_snapshot?.trim()) throw new Error('The original email has no saved message to include.')
  const date = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(original.sent_at))
  const text = `\n\n--- Earlier email ---\nFrom: ${original.sender_name} <${original.from_email}>\nTo: ${original.to_email}\nSent: ${date} (Melbourne time)\nSubject: ${original.subject_snapshot}\n\n${original.body_snapshot}\n\n${original.signature_snapshot}`
  // Quote archived plain text, never old tracking images, active HTML or unsubscribe links.
  const escaped = text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return { text, html: `<blockquote style="border-left:3px solid #cbd5e1;margin:24px 0 0;padding:12px 16px;color:#475569;">${escaped.replace(/\n/g, '<br>')}</blockquote>` }
}
