/** RFC 5545 TEXT encoding and UTF-8 octet-aware content-line folding. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

export function serializeIcs(lines: string[]): string {
  const encoder = new TextEncoder()
  return lines.map((line) => {
    if (/[\r\n]/.test(line)) throw new Error('Invalid calendar content line.')
    const parts: string[] = []
    let part = ''
    let bytes = 0
    for (const character of line) {
      const size = encoder.encode(character).length
      if (bytes + size > 75) { parts.push(part); part = ' '; bytes = 1 }
      part += character
      bytes += size
    }
    parts.push(part)
    return parts.join('\r\n')
  }).join('\r\n') + '\r\n'
}
