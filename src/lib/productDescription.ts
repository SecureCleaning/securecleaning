import sanitizeHtml from 'sanitize-html'

// Product copy permits formatting only, with no embedded media, links or styles.
export function sanitizeProductDescription(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li'],
    allowedAttributes: {},
  }).trim()
}

export function productDescriptionText(html: string) {
  return sanitizeHtml(html.replace(/<\/(?:p|h[1-3]|li|blockquote)>|<br\s*\/?\s*>/gi, '\n'), { allowedTags: [], allowedAttributes: {} })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
}
