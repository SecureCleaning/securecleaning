import { inflateSync } from 'node:zlib'


const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Buffer) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const MAX_BYTES = 10 * 1024 * 1024
const invalid = () => new Error('Use a valid PDF, JPG, PNG or WebP document (10 MB maximum).')

export function validateDocumentContent(data: Buffer, name: string, declaredType?: string | null) {
  if (!data.length || data.length > MAX_BYTES) throw invalid()
  let contentType = ''
  let extension = ''
  if (data.subarray(0, 5).toString('ascii') === '%PDF-') {
    const text = data.toString('latin1')
    if (!/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(text) || !/%%EOF\s*$/.test(text) || !/\btrailer\b|\/Type\s*\/XRef/.test(text) || !/\bstartxref\s+\d+/.test(text)) throw invalid()
    // Decode escaped PDF names before rejecting active actions and embedded payloads.
    const names = text.replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    if (/\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|Filespec|RichMedia|XFA|SubmitForm|ImportData)\b/i.test(names) || /<\s*(?:script|html|iframe|object)\b/i.test(text)) throw invalid()
    contentType = 'application/pdf'; extension = 'pdf'
  } else if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8; let ended = false; let header = false; const image: Buffer[] = []
    while (offset + 12 <= data.length) {
      const size = data.readUInt32BE(offset); const type = data.toString('ascii', offset + 4, offset + 8)
      if (size > data.length - offset - 12) throw invalid()
      if (crc32(data.subarray(offset + 4, offset + 8 + size)) !== data.readUInt32BE(offset + 8 + size)) throw invalid()
      if (!header) {
        if (type !== 'IHDR' || size !== 13) throw invalid()
        const width = data.readUInt32BE(offset + 8); const height = data.readUInt32BE(offset + 12)
        if (!width || !height || width * height > 40_000_000) throw invalid()
        header = true
      }
      if (type === 'IDAT') image.push(data.subarray(offset + 8, offset + 8 + size))
      offset += size + 12
      if (type === 'IEND') { if (size !== 0 || offset !== data.length) throw invalid(); ended = true; break }
    }
    if (!ended || !image.length) throw invalid()
    try { inflateSync(Buffer.concat(image), { maxOutputLength: 40 * 1024 * 1024 }) } catch { throw invalid() }
    contentType = 'image/png'; extension = 'png'
  } else if (data[0] === 255 && data[1] === 216) {
    if (data.length < 12 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217) throw invalid()
    let offset = 2; let frame = false; let scan = false
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 255) throw invalid()
      while (data[offset] === 255) offset++
      const marker = data[offset++]; const size = data.readUInt16BE(offset)
      if (size < 2 || offset + size > data.length) throw invalid()
      if ([192, 193, 194].includes(marker)) {
        if (size < 8) throw invalid()
        const height = data.readUInt16BE(offset + 3); const width = data.readUInt16BE(offset + 5)
        if (!width || !height || width * height > 40_000_000) throw invalid()
        frame = true
      }
      if (marker === 218) { scan = true; break }
      offset += size
    }
    if (!frame || !scan) throw invalid()
    contentType = 'image/jpeg'; extension = 'jpg'
  } else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    if (data.length < 30 || data.readUInt32LE(4) + 8 !== data.length) throw invalid()
    let offset = 12; let image = false
    while (offset + 8 <= data.length) {
      const type = data.toString('ascii', offset, offset + 4); const size = data.readUInt32LE(offset + 4)
      if (size > data.length - offset - 8) throw invalid()
      if (type === 'VP8 ') {
        const start = offset + 8
        if (size < 10 || !data.subarray(start + 3, start + 6).equals(Buffer.from([157, 1, 42]))) throw invalid()
        const width = data.readUInt16LE(start + 6) & 0x3fff; const height = data.readUInt16LE(start + 8) & 0x3fff
        if (!width || !height || width * height > 40_000_000) throw invalid()
        image = true
      }
      if (type === 'VP8L') {
        const start = offset + 8
        if (size < 5 || data[start] !== 47) throw invalid()
        const bits = data.readUInt32LE(start + 1)
        const width = (bits & 0x3fff) + 1; const height = ((bits >>> 14) & 0x3fff) + 1
        if (bits >>> 29 || width * height > 40_000_000) throw invalid()
        image = true
      }
      offset += 8 + size + (size % 2)
    }
    if (!image || offset !== data.length) throw invalid()
    contentType = 'image/webp'; extension = 'webp'
  } else throw invalid()
  if (declaredType && declaredType !== 'application/octet-stream' && declaredType !== contentType) throw invalid()
  const stem = name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120) || 'document'
  return { contentType, fileName: `${stem}.${extension}`, sizeBytes: data.length }
}

export function documentDownloadHeaders(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 150) || 'document'
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  }
}
