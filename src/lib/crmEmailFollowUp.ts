export const CRM_FOLLOW_UP_TEMPLATE_ID = 'bd790bc4-7b27-4c60-a348-2050b9f85702'

export function crmFollowUpSubject(subject: string) {
  return (/^re\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`).slice(0, 240)
}

type OriginalEmail = {
  opportunity_id: string; contact_id: string; to_email: string; status: string
  sent_at: string | null; subject_snapshot: string; body_snapshot: string
  signature_snapshot: string; sender_name: string; from_email: string
  final_text_snapshot?: string | null; footer_snapshot?: string | null
  referenceOnly?: boolean
}

export function buildCrmOriginalEmailQuote(original: OriginalEmail | null, opportunityId: string, contactId: string, recipient: string) {
  if (!original || original.opportunity_id !== opportunityId || original.contact_id !== contactId
    || original.to_email.trim().toLowerCase() !== recipient.trim().toLowerCase()
    || original.status !== 'sent' || !original.sent_at || !Number.isFinite(Date.parse(original.sent_at))) {
    throw new Error('Choose a successfully sent email for this client and recipient. If their email address has changed, compose a new email instead.')
  }
  if (!original.body_snapshot?.trim()) throw new Error('The original email has no saved message to include.')
  const date = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(original.sent_at))
  // Keep earlier replies too, but never reuse the old unsubscribe capability URL.
  const savedText = original.final_text_snapshot?.trim()
  const footer = original.footer_snapshot?.trim()
  const message = savedText && footer && savedText.endsWith(footer)
    ? savedText.slice(0, -footer.length).trimEnd()
    : [original.body_snapshot, original.signature_snapshot].filter(Boolean).join('\n\n')
  const sender = [original.sender_name, original.from_email ? `<${original.from_email}>` : ''].filter(Boolean).join(' ')
  const text = `\n\n--- ${original.referenceOnly ? 'Earlier quote reference' : 'Earlier email'} ---\nFrom: ${sender}\nTo: ${original.to_email}\nSent: ${date} (Melbourne time)\nSubject: ${original.subject_snapshot}\n\n${message}`
  // Quote archived plain text, never old tracking images, active HTML or unsubscribe links.
  const escaped = text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return { text, html: `<blockquote style="border-left:3px solid #cbd5e1;margin:24px 0 0;padding:12px 16px;color:#475569;">${escaped.replace(/\n/g, '<br>')}</blockquote>` }
}
