const QUOTE_REFERENCE_PATTERN = /^SC-\d{8}-(?:[A-Z0-9]{4}|[A-Z0-9]{8})$/

export function isQuoteReference(value: unknown): value is string {
  return typeof value === 'string' && QUOTE_REFERENCE_PATTERN.test(value)
}
