/** Count actual bytes before any JSON or multipart parser can allocate its result. */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid body limit')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const bytes = new Uint8Array(maxBytes)
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new RangeError('Request is too large.')
      }
      bytes.set(value, total - value.byteLength)
    }
  } finally { reader.releaseLock() }
  return bytes.subarray(0, total)
}
function checkMultipartStructure(bytes: Uint8Array, contentType: string | null) {
  if (!contentType || !/^multipart\/form-data(?:;|$)/i.test(contentType)) return
  const boundary = /(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType)
  const token = boundary?.[1] ?? boundary?.[2]
  if (!token || token.length > 70 || /[^\x20-\x7e]/.test(token)) throw new Error('Invalid multipart boundary.')
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const marker = Buffer.from(`--${token}`)
  const delimiter = Buffer.from(`\r\n--${token}`)
  let position = data.indexOf(marker)
  if (position < 0 || position > 1024) throw new Error('Invalid multipart body.')
  let parts = 0
  let textBytes = 0
  while (position >= 0) {
    const suffix = position + marker.length
    if (data.subarray(suffix, suffix + 2).equals(Buffer.from('--'))) return
    if (!data.subarray(suffix, suffix + 2).equals(Buffer.from('\r\n'))) throw new Error('Invalid multipart body.')
    if (++parts > 32) throw new RangeError('Too many multipart fields.')
    const headerStart = suffix + 2
    const headerEnd = data.indexOf('\r\n\r\n', headerStart)
    if (headerEnd < 0) throw new Error('Invalid multipart headers.')
    if (headerEnd - headerStart > 8192) throw new RangeError('Multipart headers are too large.')
    const contentStart = headerEnd + 4
    let next = data.indexOf(delimiter, contentStart)
    while (next >= 0) {
      const ending = data.subarray(next + delimiter.length, next + delimiter.length + 2).toString('ascii')
      if (ending === '--' || ending === '\r\n') break
      next = data.indexOf(delimiter, next + delimiter.length)
    }
    if (next < 0) throw new Error('Unterminated multipart body.')
    const headers = data.subarray(headerStart, headerEnd).toString('latin1')
    if (!/^content-disposition:[^\r\n]*;\s*filename(?:\*)?=/im.test(headers)) {
      const length = next - contentStart
      textBytes += length
      if (length > 64 * 1024 || textBytes > 256 * 1024) throw new RangeError('Multipart text is too large.')
    }
    position = next + 2
  }
}

const guarded = new WeakMap<Request, Uint8Array>()
export async function boundRequestBody(request: Request, maxBytes: number) {
  const cached = guarded.get(request)
  const bytes = cached ?? await readBoundedBody(request, maxBytes)
  if (bytes.byteLength > maxBytes) throw new RangeError('Request is too large.')
  if (cached) return
  checkMultipartStructure(bytes, request.headers.get('content-type'))
  guarded.set(request, bytes)
  // Existing callers keep native JSON/multipart parsing after aggregate limiting.
  const bounded = new Response(bytes as BodyInit, { headers: request.headers })
  for (const method of ['json', 'text', 'formData', 'arrayBuffer', 'blob'] as const) {
    Object.defineProperty(request, method, { value: bounded[method].bind(bounded), configurable: true })
  }
}
