import 'server-only'

import { createHash } from 'crypto'
import sanitizeHtml from 'sanitize-html'
import { plainTextToEmailHtml, type RichEmailContent, type RichEmailDocument } from '@/lib/richEmailContent'

const MAX_DOCUMENT_BYTES = 150_000

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeDocument(value: unknown): RichEmailDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const serialized = JSON.stringify(value)
  if (serialized.length > MAX_DOCUMENT_BYTES) throw new Error('The formatted email is too large.')
  return JSON.parse(serialized) as RichEmailDocument
}

export function sanitizeRichEmailHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4',
      'blockquote', 'ul', 'ol', 'li', 'a', 'hr', 'div', 'span', 'table', 'thead',
      'tbody', 'tfoot', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      table: ['role', 'width', 'cellpadding', 'cellspacing', 'border', 'align', 'style'],
      thead: ['style'], tbody: ['style'], tfoot: ['style'], tr: ['style'],
      td: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'style'],
      th: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'scope', 'style'],
      p: ['align', 'style'], div: ['align', 'style'], span: ['style'],
      h1: ['align', 'style'], h2: ['align', 'style'], h3: ['align', 'style'], h4: ['align', 'style'],
      blockquote: ['style'], ul: ['style'], ol: ['style'], li: ['style'], hr: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,.%]+\)$/i, /^[a-z]{3,20}$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,.%]+\)$/i, /^[a-z]{3,20}$/i],
        'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i],
        'font-family': [/^[\w\s,'"-]{1,120}$/],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/i],
        'font-style': [/^(?:normal|italic)$/i],
        'text-decoration': [/^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/i],
        'text-align': [/^(?:left|right|center|justify)$/i],
        'line-height': [/^\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        margin: [/^[\d\s.-]+(?:px|pt|em|rem|%|auto\s*)+$/i, /^0$/],
        'margin-top': [/^-?\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        'margin-right': [/^-?\d+(?:\.\d+)?(?:px|pt|em|rem|%|auto)$/i, /^0$/],
        'margin-bottom': [/^-?\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        'margin-left': [/^-?\d+(?:\.\d+)?(?:px|pt|em|rem|%|auto)$/i, /^0$/],
        padding: [/^[\d\s.]+(?:px|pt|em|rem|%\s*)+$/i, /^0$/],
        'padding-top': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        'padding-right': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        'padding-bottom': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        'padding-left': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^0$/],
        width: [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^auto$/i],
        'max-width': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^none$/i],
        height: [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^auto$/i],
        border: [/^[\w\s().,#%-]{1,100}$/],
        'border-top': [/^[\w\s().,#%-]{1,100}$/],
        'border-right': [/^[\w\s().,#%-]{1,100}$/],
        'border-bottom': [/^[\w\s().,#%-]{1,100}$/],
        'border-left': [/^[\w\s().,#%-]{1,100}$/],
        'border-radius': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^0$/],
        display: [/^(?:block|inline|inline-block|table|table-row|table-cell|none)$/i],
        'vertical-align': [/^(?:top|middle|bottom|baseline)$/i],
      },
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
  }).trim()
}

export function parseRichEmailContent(
  input: Record<string, unknown>,
  fields: { text?: string; html?: string; document?: string; maxText?: number; maxHtml?: number } = {},
): RichEmailContent {
  const textField = fields.text ?? 'body'
  const htmlField = fields.html ?? 'bodyHtml'
  const documentField = fields.document ?? 'bodyDocument'
  const text = clean(input[textField], fields.maxText ?? 20_000)
  const requestedHtml = clean(input[htmlField], fields.maxHtml ?? 120_000)
  const html = sanitizeRichEmailHtml(requestedHtml || plainTextToEmailHtml(text))
  const document = normalizeDocument(input[documentField])
  const visibleText = text || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
  if (!visibleText) throw new Error('Message content is required.')
  return { document, html, text: visibleText }
}

export function replaceRichEmailTokens(
  content: RichEmailContent,
  replaceText: (value: string) => string,
  replaceHtml: (value: string) => string,
): RichEmailContent {
  return {
    document: content.document,
    html: sanitizeRichEmailHtml(replaceHtml(content.html)),
    text: replaceText(content.text),
  }
}

export function richEmailFingerprint(input: { subject: string; html: string; text: string; context?: string }) {
  return createHash('sha256')
    .update(`${input.context ?? ''}\n${input.subject}\n${input.html}\n${input.text}`)
    .digest('hex')
}
