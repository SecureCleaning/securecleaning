export type RichEmailDocument = Record<string, unknown> | null

export type RichEmailContent = {
  document: RichEmailDocument
  html: string
  text: string
}

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function plainTextToEmailHtml(value: string) {
  return escapeEmailHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function createRichEmailContent(input?: Partial<RichEmailContent> | null): RichEmailContent {
  const text = typeof input?.text === 'string' ? input.text : ''
  return {
    document: input?.document && typeof input.document === 'object' ? input.document : null,
    html: typeof input?.html === 'string' && input.html.trim() ? input.html : plainTextToEmailHtml(text),
    text,
  }
}

export function hasRichEmailContent(value: Pick<RichEmailContent, 'html' | 'text'>) {
  return Boolean(value.text.trim() || value.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim())
}
