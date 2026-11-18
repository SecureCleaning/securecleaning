// Exclude only direct-length image payloads from the conservative PDF name scan.
// Dictionary syntax remains visible; unsupported/ambiguous syntax keeps the original scan.
export function pdfWithoutImagePayloads(text: string): string {
  let pos = 0
  const ranges: Array<[number, number]> = []
  type Value = string | Map<string, Value> | Value[]
  const space = () => {
    while (pos < text.length) {
      if (/[\x00\t\n\f\r ]/.test(text[pos])) { pos++; continue }
      if (text[pos] === '%') { while (pos < text.length && !/[\r\n]/.test(text[pos])) pos++; continue }
      break
    }
  }
  const token = (): string => {
    space()
    const start = pos
    if (pos >= text.length) return ''
    if (text.startsWith('<<', pos) || text.startsWith('>>', pos)) { pos += 2; return text.slice(start, pos) }
    if (text[pos] === '(') {
      pos++; let depth = 1
      while (pos < text.length && depth) {
        const c = text[pos++]
        if (c === '\\') pos++
        else if (c === '(') depth++
        else if (c === ')') depth--
      }
      if (depth) throw new Error('Unclosed string')
      return '(string)'
    }
    if (text[pos] === '<') {
      pos++
      while (pos < text.length && text[pos] !== '>') pos++
      if (pos === text.length) throw new Error('Unclosed hex string')
      pos++; return '<string>'
    }
    if ('[]{}>'.includes(text[pos])) return text[pos++]
    if (text[pos] === '/') pos++
    while (pos < text.length && !/[\x00\t\n\f\r ()<>\[\]{}/%]/.test(text[pos])) pos++
    if (pos === start) throw new Error('Invalid token')
    return text.slice(start, pos).replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  }
  const value = (first: string, depth = 0): Value => {
    if (!first) throw new Error('Unexpected end')
    if (depth > 40) throw new Error('Deep nesting')
    if (first === '<<') {
      const dict = new Map<string, Value>()
      while (true) {
        const key = token()
        if (key === '>>') return dict
        if (!key.startsWith('/') || dict.has(key)) throw new Error('Ambiguous dictionary')
        dict.set(key, value(token(), depth + 1))
      }
    }
    if (first === '[') {
      const array: Value[] = []
      while (true) { const next = token(); if (next === ']') return array; array.push(value(next, depth + 1)) }
    }
    if (/^\d+$/.test(first)) {
      const saved = pos
      const second = token()
      if (/^\d+$/.test(second) && token() === 'R') return `${first} ${second} R`
      pos = saved
    }
    return first
  }
  try {
    while (pos < text.length) {
      space(); if (pos === text.length) break
      const parsed = value(token())
      if (!(parsed instanceof Map)) continue
      const saved = pos
      if (token() !== 'stream') { pos = saved; continue }
      // A stream is opaque bytes, not PDF tokens. Never look for an end marker in its payload.
      const length = parsed.get('/Length')
      if (typeof length !== 'string' || !/^\d+$/.test(length)) return text
      if (text[pos] === '\r') pos++
      if (text[pos] === '\n') pos++
      else return text
      const start = pos
      pos += Number(length)
      if (!Number.isSafeInteger(pos) || pos > text.length || token() !== 'endstream') return text
      if (parsed.get('/Type') === '/XObject' && parsed.get('/Subtype') === '/Image') ranges.push([start, start + Number(length)])
    }
  } catch { return text }
  let result = ''; let previous = 0
  for (const [start, end] of ranges) { result += text.slice(previous, start); previous = end }
  return result + text.slice(previous)
}
