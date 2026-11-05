import sanitizeHtml from 'sanitize-html'

// Retain all visible wording, including tables and paragraphs, without replaying
// tracking pixels, active HTML or old quote/acceptance/unsubscribe capability links.
export function crmArchivedEmailText(html: string) {
  const blocks = new Set(['p', 'div', 'br', 'li', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr'])
  let boundary = false
  const escaped = sanitizeHtml(html, {
    allowedTags: [], allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option', 'head', 'title', 'iframe', 'object'],
    onOpenTag: name => { if (blocks.has(name)) boundary = true },
    onCloseTag: name => { if (blocks.has(name)) boundary = true },
    textFilter: text => {
      if (!text.trim()) return boundary ? '' : ' '
      const prefix = boundary ? '\n' : ''
      boundary = false
      return prefix + text.replace(/\s+/g, ' ')
    },
  })
  // sanitize-html decodes entities while parsing, then escapes these characters.
  return escaped.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ').split('\n').map(line => line.trim()).filter(Boolean).join('\n')
}

type QuoteEmailSource = {
  email_snapshot?: { html?: string; subject?: string; from?: string } | null
  provider_message_id?: string | null
  quote_ref: string
  recipient: string
}

// The caller must first authorize the saved send's opportunity and recipient.
// Older sends predate email snapshots. Read only the exact provider ID stored
// in that send ledger; never search by address or rebuild today's quote email.
export async function getCrmQuoteEmailText(source: QuoteEmailSource) {
  const archived = source.email_snapshot
  if (archived?.html) return { text: crmArchivedEmailText(archived.html), subject: archived.subject, from: archived.from }
  const providerId = source.provider_message_id
  if (!providerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId) || !process.env.RESEND_API_KEY) return null
  try {
    const response = await fetch(`https://api.resend.com/emails/${providerId}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return null
    const email = await response.json()
    if (email?.id !== providerId || !Array.isArray(email.to) || email.to.length !== 1
      || typeof email.to[0] !== 'string' || email.to[0].trim().toLowerCase() !== source.recipient.trim().toLowerCase()
      || typeof email.subject !== 'string' || !email.subject.includes(source.quote_ref)) return null
    const text = typeof email.html === 'string' && email.html ? crmArchivedEmailText(email.html)
      : typeof email.text === 'string' ? email.text.replace(/https?:\/\/[^\s<>]+/g, '[link from original email]') : ''
    return text ? { text, subject: email.subject, from: typeof email.from === 'string' ? email.from : undefined } : null
  } catch {
    // An unavailable provider archive must not invent content or trigger a send.
    return null
  }
}
