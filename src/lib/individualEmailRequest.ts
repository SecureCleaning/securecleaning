// Persist only opaque draft hashes and request IDs so response loss survives reloads.
export function individualEmailRequestId(fingerprint: string) {
  const key = `secure-cleaning-email-request:v1:${fingerprint}`
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}
export function completeIndividualEmailRequest(fingerprint: string) {
  localStorage.removeItem(`secure-cleaning-email-request:v1:${fingerprint}`)
}
