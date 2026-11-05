/** Human-readable identity; references are only a last resort for legacy records. */
export function adminAlertClientLabel(inputs: unknown, fallback: string): string {
  const data = inputs && typeof inputs === 'object' && !Array.isArray(inputs)
    ? inputs as Record<string, unknown> : {}
  const text = (key: string) => typeof data[key] === 'string' ? data[key].trim() : ''
  const name = text('businessName') || text('contactName')
  const suburb = text('suburb')
  return [name, suburb].filter(Boolean).join(' - ') || fallback
}
