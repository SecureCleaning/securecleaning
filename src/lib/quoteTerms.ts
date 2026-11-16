// Keep published versions immutable: create a new dated document for future amendments.
export const QUOTE_TERMS_VERSION = '2026-11-16'
export const QUOTE_TERMS_PATH = `/quote-terms/${QUOTE_TERMS_VERSION}`
export const QUOTE_TERMS_PDF_PATH = `/documents/secure-cleaning-quote-terms-${QUOTE_TERMS_VERSION}.pdf`

export function quoteValidityLabel(validUntil?: string | null) {
  if (!validUntil || !Number.isFinite(Date.parse(validUntil))) return 'Valid for 30 days from the quote issue date.'
  return `Valid until ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' }).format(new Date(validUntil))}. After this date, pricing and availability must be reconfirmed.`
}
