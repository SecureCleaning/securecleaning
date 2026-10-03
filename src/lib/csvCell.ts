// Spreadsheet applications interpret formula prefixes even inside quoted CSV cells.
export function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join('; ') : typeof value === 'boolean' ? (value ? 'yes' : 'no') : value == null ? '' : String(value)
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text
  return '"' + safe.replace(/"/g, '""') + '"'
}
