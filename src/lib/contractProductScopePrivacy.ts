// Scan the entire rendered scope, including long room/task lists.
function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr').replace(/\bboulevard\b/g, 'blvd').replace(/\bhighway\b/g, 'hwy')
    .replace(/\bproprietary limited\b/g, 'pty ltd')
    .replace(/\s+/g, ' ').trim()
}
export function containsSourceIdentity(text: string, identities: unknown[], phone: unknown) {
  const normalized = normalize(text)
  const phoneDigits = String(phone ?? '').replace(/[^0-9]/g, '')
  return identities.map(normalize).filter(value => value.length >= 4).some(value => normalized.includes(value))
    || (phoneDigits.length >= 8 && text.replace(/[^0-9]/g, '').includes(phoneDigits))
}
