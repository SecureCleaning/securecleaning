import { escapeHtml } from './htmlEscape'

export const PARTNER_CLEANER_SUBJECT = 'Complete your Secure Cleaning cleaner details'
export const PARTNER_CLEANER_HISTORY = 'Following the telephone conversation, a secure link was sent to review and complete the cleaner profile. The private link expires after 48 hours and is not retained in this history.'

export function partnerCleanerMessage(firstName: string, businessName: string, link: string) {
  const greeting = firstName === 'Manager' ? 'Hello,' : `Hi ${firstName},`
  const intro = `Thank you for speaking with our team about potential cleaning contract purchases through Secure Cleaning. We have recorded the initial details for ${businessName}.`
  const instructions = 'Please review your details and add any missing information, including your service areas, preferred work, specialist machinery and relevant documents.'
  const ending = 'Your details will be reviewed by Secure Cleaning. This email does not approve your registration or commit you to purchasing a contract.'
  return {
    subject: PARTNER_CLEANER_SUBJECT,
    text: `${greeting}\n\n${intro}\n\n${instructions}\n\nReview and complete your details: ${link}\n\nThis secure link expires in 48 hours. If it expires, reply to this email to request another link.\n\n${ending}\n\nKind regards,\nSecure Cleaning`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6"><h1 style="color:#0f766e;font-size:24px">Secure Cleaning</h1><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p><p>${escapeHtml(instructions)}</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:6px">Review and complete your details</a></p><p>This secure link expires in 48 hours. If it expires, reply to this email to request another link.</p><p>${escapeHtml(ending)}</p><p>Kind regards,<br>Secure Cleaning</p></div>`,
  }
}
