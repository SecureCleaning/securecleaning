export type ContractSaleChecklistData = {
  inspectionDate: string
  commencementDate: string
  clientBusiness: string
  clientContact: string
  clientPhone: string
  clientEmail: string
  cleanerBusiness: string
  cleanerContact: string
  cleanerPhone: string
  cleanerEmail: string
  siteName: string
  siteAddress: string
  cleaningDays: string
  cleaningTime: string
  frequency: string
  scopeSummary: string
  initialClean: string
  accessHours: string
  accessInstructions: string
  inductionRequirements: string
  alarmSecurity: string
  keyholderDetails: string
  lightSwitches: string
  cleanerStorage: string
  consumables: string
  waterAccess: string
  rubbishDisposal: string
  cleanerBook: string
  hazards: string
  equipment: string
  keysItemsHandedOver: string
  notes: string
}

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const GREEN = '0.047 0.463 0.431'
const NAVY = '0.102 0.153 0.267'
const MUTED = '0.350 0.390 0.450'
const LIGHT = '0.945 0.965 0.960'

function ascii(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '-').replace(/\s+/g, ' ').trim()
}

function escapePdf(value: unknown) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(value: string, maxChars: number) {
  const words = ascii(value).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) { lines.push(current); current = word }
    else current = next
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'To be confirmed'
  const date = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

type Field = { label: string; value: string; lines?: number }

function fieldLines(field: Field) {
  const valueLines = wrap(field.value || ' ', 66)
  if (field.value.trim()) return valueLines
  return Array.from({ length: Math.min(field.lines ?? 1, 3) }, () => ' ')
}

function fieldHeight(field: Field) {
  return Math.max(34, 22 + fieldLines(field).length * 12)
}

function pageContent(title: string, saleCode: string, productCode: string, fields: Field[], page: number, pageCount: number) {
  const commands: string[] = []
  const text = (value: string, x: number, y: number, size = 9, bold = false, colour = NAVY) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colour} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, colour = '0.820 0.840 0.860') => commands.push(`${colour} RG 1 w ${x1} ${y1} m ${x2} ${y2} l S`)
  const fill = (x: number, y: number, width: number, height: number, colour: string) => commands.push(`${colour} rg ${x} ${y} ${width} ${height} re f`)

  fill(0, 760, PAGE_WIDTH, 82, GREEN)
  text('Secure Cleaning', 42, 802, 22, true, '1 1 1')
  text(title, 345, 802, 17, true, '1 1 1')
  text(`${saleCode} | ${productCode}`, 345, 780, 9, false, '1 1 1')

  let y = 728
  for (const field of fields) {
    const valueLines = fieldLines(field)
    const height = fieldHeight(field)
    fill(42, y - height + 8, 511, height, LIGHT)
    text(field.label.toUpperCase(), 52, y - 6, 7.5, true, GREEN)
    valueLines.forEach((value, index) => text(value, 210, y - 6 - index * 12, 9, false, NAVY))
    y -= height + 7
  }

  line(42, 62, 553, 62)
  text('Secure Cleaning - confidential site handover information', 42, 44, 7.5, false, MUTED)
  text(`Page ${page} of ${pageCount}`, 498, 44, 7.5, false, MUTED)
  return commands.join('\n')
}

function pdfFromPages(contents: string[]) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${contents.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${contents.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  contents.forEach((content, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
  })
  let pdf = '%PDF-1.4\n%SecureCleaning\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

export function buildContractSaleChecklistPdf(input: { saleCode: string; productCode: string; checklist: ContractSaleChecklistData }) {
  const c = input.checklist
  const sections: Field[][] = [
    [
      { label: 'Inspection date', value: formatDate(c.inspectionDate) },
      { label: 'Commencement date', value: formatDate(c.commencementDate) },
      { label: 'Client', value: [c.clientBusiness, c.clientContact, c.clientPhone, c.clientEmail].filter(Boolean).join(' | '), lines: 3 },
      { label: 'Cleaner', value: [c.cleanerBusiness, c.cleanerContact, c.cleanerPhone, c.cleanerEmail].filter(Boolean).join(' | '), lines: 3 },
      { label: 'Site', value: [c.siteName, c.siteAddress].filter(Boolean).join(' - '), lines: 3 },
      { label: 'Cleaning schedule', value: [c.cleaningDays, c.cleaningTime, c.frequency].filter(Boolean).join(' | '), lines: 3 },
      { label: 'Scope summary', value: c.scopeSummary, lines: 7 },
      { label: 'Initial / spring clean', value: c.initialClean, lines: 3 },
    ],
    [
      { label: 'Access hours', value: c.accessHours, lines: 4 },
      { label: 'Access instructions', value: c.accessInstructions, lines: 6 },
      { label: 'Induction requirements', value: c.inductionRequirements, lines: 5 },
      { label: 'Alarm / security', value: c.alarmSecurity, lines: 6 },
      { label: 'Keyholder', value: c.keyholderDetails, lines: 4 },
      { label: 'Light switches / shutdown', value: c.lightSwitches, lines: 4 },
      { label: 'Cleaner storage', value: c.cleanerStorage, lines: 4 },
    ],
    [
      { label: 'Consumables', value: c.consumables, lines: 5 },
      { label: 'Water access', value: c.waterAccess, lines: 4 },
      { label: 'Rubbish / recycling', value: c.rubbishDisposal, lines: 5 },
      { label: 'Cleaner communication book', value: c.cleanerBook, lines: 4 },
      { label: 'Hazards', value: c.hazards, lines: 6 },
      { label: 'Equipment', value: c.equipment, lines: 5 },
      { label: 'Keys / items handed over', value: c.keysItemsHandedOver, lines: 5 },
      { label: 'Additional notes', value: c.notes, lines: 8 },
    ],
  ]
  const pages = sections.flatMap((section) => {
    const chunks: Field[][] = []
    let current: Field[] = []
    let used = 0
    for (const field of section) {
      const required = fieldHeight(field) + 7
      if (current.length && used + required > 640) { chunks.push(current); current = []; used = 0 }
      current.push(field); used += required
    }
    if (current.length) chunks.push(current)
    return chunks
  })
  const contents = pages.map((fields, index) => pageContent('NEW SITE CHECKLIST', input.saleCode, input.productCode, fields, index + 1, pages.length))
  return pdfFromPages(contents)
}
