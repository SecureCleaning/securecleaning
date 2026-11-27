import 'server-only'

import { applyEmailMergeFields, findEmailMergeFieldKeys } from '@/lib/emailMergeFields'
import { escapeEmailHtml, plainTextToEmailHtml, type RichEmailDocument } from '@/lib/richEmailContent'
import { sanitizeRichEmailHtml } from '@/lib/richEmailServer'

const visitTitles = {
  availability: 'Arrange a site visit',
  client: 'Site visit confirmed',
  cleaner: 'Site visit confirmed',
} as const

export type InspectionEmailKind = keyof typeof visitTitles

const appointmentFields = new Set(['inspection_date', 'inspection_time', 'inspection_duration', 'inspection_location'])

// Existing templates keep the details in a paragraph with line breaks. Style
// that block in place, leaving custom layouts and sentences intact.
function highlightAppointmentDetails(html: string) {
  return html.replace(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi, (paragraph, content: string) => {
    const lines = content.split(/<br\s*\/?>/i)
    if (lines.length !== appointmentFields.size) return paragraph

    const fields = new Set<string>()
    for (const line of lines) {
      const text = line.replace(/<[^>]+>/g, '').trim()
      const [field, extra] = findEmailMergeFieldKeys(text)
      if (extra || !appointmentFields.has(field)) return paragraph
      const label = applyEmailMergeFields(text, { [field]: '' }).trim()
      if (!/^[^:]{1,40}:$/.test(label)) return paragraph
      fields.add(field)
    }
    if (fields.size !== appointmentFields.size) return paragraph

    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:20px 0;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <tr><td style="padding:4px 18px;color:#173a2a;line-height:1.75">${paragraph}</td></tr>
    </table>`
  })
}

export function renderContractSaleInspectionEmail(
  kind: InspectionEmailKind,
  draft: { subject: string; bodyText: string; bodyHtml: string; bodyDocument: RichEmailDocument },
  values: Record<string, string>,
) {
  const subject = applyEmailMergeFields(draft.subject, values)
  const bodyText = applyEmailMergeFields(draft.bodyText, values)
  const safeValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeEmailHtml(value)]))
  const sourceHtml = draft.bodyHtml.trim() ? sanitizeRichEmailHtml(draft.bodyHtml) : plainTextToEmailHtml(draft.bodyText)
  const formattedHtml = kind === 'availability' ? sourceHtml : highlightAppointmentDetails(sourceHtml)
  const bodyHtml = sanitizeRichEmailHtml(applyEmailMergeFields(formattedHtml, safeValues))
  const heading = /<h1[\s>]/i.test(bodyHtml) ? 'p' : 'h1'
  const html = `<!doctype html>
<html lang="en-AU" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeEmailHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9">
  <table lang="en-AU" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f1f5f9">
    <tr><td align="center" style="padding:20px 12px">
      <!--[if mso]><table role="presentation" width="640" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;font-family:Arial,sans-serif">
        <tr><td style="padding:22px 24px;background-color:#1a2744;color:#ffffff;border-bottom:4px solid #c69b2d">
          <p style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:bold">Secure Cleaning</p>
          <${heading} style="margin:8px 0 0;color:#bbf7d0;font-size:19px;line-height:1.4;font-weight:bold">${visitTitles[kind]}</${heading}>
        </td></tr>
        <tr><td style="padding:12px 24px 18px;color:#1f2937;font-size:16px;line-height:1.6;overflow-wrap:anywhere">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.5">
          <a href="https://securecleaning.com.au/" style="color:#115e59;text-decoration:underline">Secure Cleaning website</a>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`
  return { subject, bodyText, bodyHtml, bodyDocument: draft.bodyDocument, html }
}
