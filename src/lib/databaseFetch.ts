export const DATABASE_REQUEST_TIMEOUT_MS = 15_000

// Keep the deadline attached to the response body, not just the response headers.
// Do not retry writes: a timeout does not establish whether a write committed.
export function databaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DATABASE_REQUEST_TIMEOUT_MS
) {
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline
  return fetch(input, { ...init, signal, cache: 'no-store' })
}
