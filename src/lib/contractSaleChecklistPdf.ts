import type { CleanerScopeSnapshotV1, CleanerScopeTask } from '@/lib/contractProductPolicy'

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
const BORDER = '0.790 0.820 0.830'

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
  return lines
}

function fitLines(value: string, maxChars: number, maxLines: number) {
  const lines = wrap(value, maxChars)
  if (lines.length <= maxLines) return lines
  const visible = lines.slice(0, maxLines)
  visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`
  return visible
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || ''
  const date = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function canvas() {
  const commands: string[] = []
  return {
    text(value: string, x: number, y: number, size = 8, bold = false, colour = NAVY) {
      commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colour} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`)
    },
    line(x1: number, y1: number, x2: number, y2: number, colour = BORDER, width = 0.7) {
      commands.push(`${colour} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
    },
    fill(x: number, y: number, width: number, height: number, colour: string) {
      commands.push(`${colour} rg ${x} ${y} ${width} ${height} re f`)
    },
    stroke(x: number, y: number, width: number, height: number, colour = BORDER) {
      commands.push(`${colour} RG 0.7 w ${x} ${y} ${width} ${height} re S`)
    },
    output() { return commands.join('\n') },
  }
}

type Canvas = ReturnType<typeof canvas>

function header(c: Canvas, title: string, saleCode: string, productCode: string, scopeAttached: boolean, page?: string) {
  c.fill(0, 778, PAGE_WIDTH, 64, GREEN)
  c.text('Secure Cleaning', 32, 809, 19, true, '1 1 1')
  c.text(title, 327, 809, 15, true, '1 1 1')
  c.text(`${saleCode} | ${productCode}`, 327, 789, 8, false, '1 1 1')
  if (title === 'NEW SITE CHECKLIST') c.text(`SCOPE OF WORKS: ${scopeAttached ? 'ATTACHED' : 'NOT ATTACHED'}`, 32, 789, 7.5, true, '1 1 1')
  if (page) c.text(page, 520, 789, 7.5, false, '1 1 1')
}

function sectionBar(c: Canvas, title: string, y: number) {
  c.fill(32, y - 3, 531, 17, GREEN)
  c.text(title.toUpperCase(), 40, y + 2, 8, true, '1 1 1')
}

function field(c: Canvas, input: { x: number; top: number; width: number; height: number; label: string; value: string; maxLines?: number }) {
  const { x, top, width, height, label, value } = input
  c.fill(x, top - height, width, height, LIGHT)
  c.stroke(x, top - height, width, height)
  c.text(label.toUpperCase(), x + 6, top - 10, 6.4, true, GREEN)
  const lines = fitLines(value, Math.max(12, Math.floor((width - 12) / 4.7)), input.maxLines ?? 2)
  if (lines.length) lines.forEach((line, index) => c.text(line, x + 6, top - 23 - index * 9, 7.5, false, NAVY))
  else c.line(x + 6, top - 25, x + width - 6, top - 25, '0.730 0.760 0.780', 0.5)
}

function checklistPageContent(input: { saleCode: string; productCode: string; checklist: ContractSaleChecklistData; scopeAttached: boolean }) {
  const c = canvas()
  const data = input.checklist
  header(c, 'NEW SITE CHECKLIST', input.saleCode, input.productCode, input.scopeAttached)
  sectionBar(c, 'Site and contact details', 755)
  const left = 32
  const gap = 8
  const width = (531 - gap) / 2
  const right = left + width + gap
  const details = [
    [{ label: 'Inspection date', value: formatDate(data.inspectionDate) }, { label: 'Commencement date', value: formatDate(data.commencementDate) }],
    [{ label: 'Client', value: [data.clientBusiness, data.clientContact].filter(Boolean).join(' - ') }, { label: 'Cleaner', value: [data.cleanerBusiness, data.cleanerContact].filter(Boolean).join(' - ') }],
    [{ label: 'Client contact', value: [data.clientPhone, data.clientEmail].filter(Boolean).join(' | ') }, { label: 'Cleaner contact', value: [data.cleanerPhone, data.cleanerEmail].filter(Boolean).join(' | ') }],
    [{ label: 'Site', value: data.siteName }, { label: 'Cleaning schedule', value: [data.cleaningDays, data.cleaningTime, data.frequency].filter(Boolean).join(' | ') }],
    [{ label: 'Site address', value: data.siteAddress }, { label: 'Initial / spring clean', value: data.initialClean }],
  ]
  let top = 735
  for (const [leftField, rightField] of details) {
    field(c, { x: left, top, width, height: 38, ...leftField, maxLines: 2 })
    field(c, { x: right, top, width, height: 38, ...rightField, maxLines: 2 })
    top -= 40
  }

  sectionBar(c, 'Site setup checklist', 523)
  const operational = [
    [
      ['Access hours', data.accessHours], ['Access instructions', data.accessInstructions],
      ['Induction requirements', data.inductionRequirements], ['Alarm / security', data.alarmSecurity],
      ['Keyholder details', data.keyholderDetails], ['Light switches / shutdown', data.lightSwitches],
      ['Cleaner storage', data.cleanerStorage], ['Keys / items handed over', data.keysItemsHandedOver],
    ],
    [
      ['Consumables', data.consumables], ['Water access', data.waterAccess],
      ['Rubbish / recycling', data.rubbishDisposal], ['Cleaner communication book', data.cleanerBook],
      ['Hazards', data.hazards], ['Equipment', data.equipment],
      ['Scope reviewed with cleaner', ''], ['Client special instructions', ''],
    ],
  ] as const
  operational.forEach((column, columnIndex) => {
    let fieldTop = 503
    column.forEach(([label, value]) => {
      field(c, { x: columnIndex ? right : left, top: fieldTop, width, height: 31, label, value, maxLines: 1 })
      fieldTop -= 32.5
    })
  })

  sectionBar(c, 'Additional notes', 231)
  c.stroke(32, 66, 531, 148)
  const noteLines = fitLines(data.notes, 112, 4)
  noteLines.forEach((line, index) => c.text(line, 40, 196 - index * 13, 8, false, NAVY))
  for (let index = 0; index < 7; index += 1) c.line(40, 143 - index * 12, 555, 143 - index * 12, '0.760 0.790 0.810', 0.45)
  c.line(32, 50, 563, 50)
  c.text('Secure Cleaning - confidential site handover information', 32, 34, 7, false, MUTED)
  c.text('Checklist page 1 of 1', 476, 34, 7, false, MUTED)
  return c.output()
}

type ScopeLine = { text: string; bold?: boolean; indent?: number; colour?: string }

function taskText(task: CleanerScopeTask) {
  if (typeof task === 'string') return task
  const cadence = ascii(task.cadence).replace(/_/g, ' ')
  return `${task.label}${cadence ? ` - ${cadence}` : ''}`
}

function scopeBlocks(scope: CleanerScopeSnapshotV1) {
  const blocks: ScopeLine[][] = []
  const overview = [
    `Premises: ${scope.premisesType || 'Commercial site'}`,
    `Frequency: ${scope.frequency || 'To be confirmed'} | Floors: ${scope.floors || '-'} | Floor area: ${scope.floorArea || '-'} sqm`,
    scope.summary ? `Summary: ${scope.summary}` : '',
    scope.selectedOptions.length ? `Selected services: ${scope.selectedOptions.join(', ')}` : '',
  ].filter(Boolean).flatMap((value) => fitLines(value, 92, 4).map((text) => ({ text })))
  blocks.push([{ text: 'SITE SCOPE OVERVIEW', bold: true, colour: GREEN }, ...overview])
  scope.rooms.forEach((room, roomIndex) => {
    const metrics = [`Qty ${room.quantity}`]
    if (room.size > 0) metrics.push(`${room.size} sqm each`)
    if (room.floor > 0) metrics.push(`Floor ${room.floor}`)
    const block: ScopeLine[] = [{ text: `${roomIndex + 1}. ${room.label} - ${metrics.join(' | ')}`, bold: true, colour: GREEN }]
    if (room.description) block.push(...fitLines(room.description, 88, 3).map((text) => ({ text, indent: 8 })))
    room.tasks.forEach((task) => block.push(...fitLines(`- ${taskText(task)}`, 86, 3).map((text) => ({ text, indent: 12 }))))
    ;(room.selectedOptions ?? []).forEach((option) => block.push(...fitLines(`- ${option}`, 86, 2).map((text) => ({ text, indent: 12 }))))
    blocks.push(block)
  })
  return blocks
}

function paginateScope(scope: CleanerScopeSnapshotV1) {
  const capacity = 51
  const pages: ScopeLine[][] = []
  let page: ScopeLine[] = []
  for (const block of scopeBlocks(scope)) {
    const required = block.length + (page.length ? 1 : 0)
    if (page.length && page.length + required > capacity) { pages.push(page); page = [] }
    if (block.length <= capacity) {
      if (page.length) page.push({ text: '' })
      page.push(...block)
      continue
    }
    for (const line of block) {
      if (page.length >= capacity) { pages.push(page); page = [] }
      page.push(line)
    }
  }
  if (page.length) pages.push(page)
  return pages
}

function scopePageContent(input: { saleCode: string; productCode: string; lines: ScopeLine[]; page: number; pageCount: number }) {
  const c = canvas()
  header(c, 'SCOPE OF WORKS', input.saleCode, input.productCode, true, `${input.page} / ${input.pageCount}`)
  let y = 754
  for (const line of input.lines) {
    if (!line.text) { y -= 6; continue }
    c.text(line.text, 38 + (line.indent ?? 0), y, line.bold ? 8.5 : 7.7, Boolean(line.bold), line.colour ?? NAVY)
    y -= line.bold ? 13 : 11
  }
  c.line(32, 50, 563, 50)
  c.text('Secure Cleaning - scope supplied for site handover', 32, 34, 7, false, MUTED)
  c.text(`Scope page ${input.page} of ${input.pageCount}`, 480, 34, 7, false, MUTED)
  return c.output()
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

export function buildContractSaleChecklistPdf(input: {
  saleCode: string
  productCode: string
  checklist: ContractSaleChecklistData
  includeScope?: boolean
  scope?: CleanerScopeSnapshotV1 | null
}) {
  const contents = [checklistPageContent({ saleCode: input.saleCode, productCode: input.productCode, checklist: input.checklist, scopeAttached: Boolean(input.includeScope && input.scope) })]
  if (input.includeScope && input.scope) {
    const pages = paginateScope(input.scope)
    contents.push(...pages.map((lines, index) => scopePageContent({ saleCode: input.saleCode, productCode: input.productCode, lines, page: index + 1, pageCount: pages.length })))
  }
  return pdfFromPages(contents)
}
