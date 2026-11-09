import { escapeHtml } from './htmlEscape'

export const PARTNER_CLEANER_SUBJECT = 'Complete your Secure Cleaning cleaner details'
export const PARTNER_CLEANER_HISTORY = 'Following the telephone conversation, a secure link was sent to review and complete the cleaner profile. The private link expires after 48 hours and is not retained in this history.'

export function partnerCleanerMessage(firstName: string, businessName: string, link: string, unsubscribeUrl: string) {
  const greeting = firstName === 'Manager' ? 'Hello,' : `Hi ${firstName},`
  const intro = `Thank you for speaking with our team about potential cleaning contract purchases through Secure Cleaning. We have recorded the initial details for ${businessName}.`
  const instructions = 'Please review your details and add any missing information, including your service areas, preferred work, specialist machinery and relevant documents.'
  const ending = 'Your details will be reviewed by Secure Cleaning. This email does not approve your registration or commit you to purchasing a contract.'
  const preferences = 'You received this email because you asked our team to send a link to complete your cleaner details. You can unsubscribe from cleaner outreach and job broadcasts. Messages needed to manage work you request or already hold are unaffected.'
  return {
    subject: PARTNER_CLEANER_SUBJECT,
    text: `Secure Cleaning\nComplete your cleaner details\n\n${greeting}\n\n${intro}\n\n${instructions}\n\nReview and complete your details: ${link}\n\nThis secure link expires in 48 hours. If it expires, reply to this email to request another link.\n\n${ending}\n\nKind regards,\nSecure Cleaning\n\n${preferences}\nUnsubscribe from cleaner outreach and job broadcasts: ${unsubscribeUrl}\nSecure Cleaning | securecleaning.com.au`,
    html: `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${PARTNER_CLEANER_SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;color:#1f2937;font-family:Arial,sans-serif">
  <div lang="en" dir="ltr" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">Review your cleaner details and tell us about your services and equipment.</div>
  <table lang="en" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;border:1px solid #d1d5db;border-radius:12px;background:#ffffff;overflow:hidden;line-height:1.6;font-size:16px;word-break:break-word">
      <tr><td style="background:#0f766e;color:#ffffff;padding:24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:28px;line-height:1.3">Secure Cleaning</h1>
        <p style="margin:6px 0 0">Complete your cleaner details</p>
      </td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px">${escapeHtml(intro)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px"><tr><td style="padding:20px">
          <h2 style="margin:0 0 10px;font-size:18px">Review your cleaner profile</h2>
          <p style="margin:0 0 12px"><strong>Business:</strong> ${escapeHtml(businessName)}</p>
          <p style="margin:0">${escapeHtml(instructions)}</p>
        </td></tr></table>
        <p style="margin:24px 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 18px;border-radius:6px;font-weight:bold;text-decoration:none">Review and complete your details</a></p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569">This secure link expires in <strong>48 hours</strong>. If it expires, reply to this email to request another link.</p>
        <p style="margin:0 0 20px">${escapeHtml(ending)}</p>
        <p style="margin:0">Kind regards,<br>Secure Cleaning</p>
      </td></tr>
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;font-size:13px;color:#475569">
        <p style="margin:0 0 12px">${escapeHtml(preferences)}</p>
        <p style="margin:0 0 12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#0f766e;text-decoration:underline">Unsubscribe from cleaner outreach and job broadcasts</a></p>
        <p style="margin:0">Secure Cleaning | <a href="https://securecleaning.com.au" style="color:#0f766e">securecleaning.com.au</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  }
}
