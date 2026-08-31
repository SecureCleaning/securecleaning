export type ContractSaleAgreementPdfInput = {
  content: string
  saleCode: string
  productCode: string
  cleanerBusiness: string
  preparedBy: string
  preparedOn: string
}

type AgreementLine = { kind: 'title' | 'subtitle' | 'heading' | 'detail' | 'paragraph' | 'blank'; text: string }

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

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function lineKind(text: string, index: number): AgreementLine['kind'] {
  if (!text.trim()) return 'blank'
  if (index === 0) return 'title'
  if (index === 1 && /DRAFT FOR REVIEW/i.test(text)) return 'subtitle'
  if (/^(PARTIES|SCHEDULE \d+|\d+\. [A-Z][A-Z ,/&-]+|PURCHASER|SECURE CLEANING|IMPORTANT:)/.test(text)) return 'heading'
  if (/^[A-Za-z][A-Za-z ]{1,38}:\s/.test(text)) return 'detail'
  return 'paragraph'
}

export function parseContractSaleAgreement(content: string): AgreementLine[] {
  return content.replace(/\r\n/g, '\n').split('\n').map((text, index) => ({ kind: lineKind(text, index), text: text.trim() }))
}

export function renderContractSaleAgreementEmailHtml(input: ContractSaleAgreementPdfInput) {
  const summary = parseContractSaleAgreement(input.content).filter((line) => line.kind === 'detail').slice(0, 10)
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1f2937;line-height:1.5">
    <div style="background:#0f766e;color:#fff;padding:24px 28px;border-radius:12px 12px 0 0"><h1 style="margin:0;font-size:26px">Secure Cleaning</h1><p style="margin:6px 0 0">Contract sale document bundle</p></div>
    <div style="border:1px solid #d1d5db;border-top:0;padding:26px 28px;border-radius:0 0 12px 12px">
      <p>Hi ${escapeHtml(input.cleanerBusiness)},</p>
      <p>Please review the attached cleaning contract purchase agreement and tax invoice. The invoice records the complete purchase price; only the stated deposit is payable now.</p>
      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>Product sale:</strong> ${escapeHtml(input.saleCode)}</p>
        <p style="margin:0 0 8px"><strong>Contract product:</strong> ${escapeHtml(input.productCode)}</p>
        ${summary.map((line) => `<p style="margin:4px 0">${escapeHtml(line.text)}</p>`).join('')}
      </div>
      <p>Please sign and return the agreement. The deposit must clear before the site inspection, and the remaining balance is payable before cleaning commences unless an approved written payment plan applies.</p>
      <p>Kind regards,<br>${escapeHtml(input.preparedBy)}<br>Secure Cleaning</p>
    </div>
  </div>`
}

function wrap(value: string, maxChars: number) {
  const words = ascii(value).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function pageHeader(commands: string[], input: ContractSaleAgreementPdfInput, pageNumber: number) {
  const text = (value: unknown, x: number, y: number, size = 10, bold = false, colour = NAVY) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colour} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`)
  }
  commands.push(`${GREEN} rg 0 770 ${PAGE_WIDTH} 72 re f`)
  text('Secure Cleaning', 42, 808, 22, true, '1 1 1')
  text('Cleaning contract purchase agreement', 42, 788, 10, false, '1 1 1')
  text(input.saleCode, 454, 806, 10, true, '1 1 1')
  text(`Page ${pageNumber}`, 500, 788, 8, false, '1 1 1')
  commands.push(`0.820 0.840 0.860 RG 1 w 42 62 m 553 62 l S`)
  text(`Product ${input.productCode} | Prepared by ${input.preparedBy} | ${input.preparedOn}`, 42, 44, 8, false, MUTED)
}

export function buildContractSaleAgreementPdf(input: ContractSaleAgreementPdfInput) {
  const pages: string[][] = [[]]
  let pageIndex = 0
  let y = 742
  pageHeader(pages[pageIndex], input, 1)
  const addPage = () => {
    pages.push([])
    pageIndex += 1
    y = 742
    pageHeader(pages[pageIndex], input, pageIndex + 1)
  }
  const ensure = (height: number) => { if (y - height < 78) addPage() }
  const text = (value: unknown, x: number, atY: number, size = 10, bold = false, colour = NAVY) => {
    pages[pageIndex].push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colour} rg 1 0 0 1 ${x} ${atY} Tm (${escapePdf(value)}) Tj ET`)
  }

  const lines = parseContractSaleAgreement(input.content)
  for (const [index, line] of lines.entries()) {
    if (line.kind === 'title' || line.kind === 'subtitle') continue
    if (line.kind === 'blank') { y -= 7; continue }
    if (line.kind === 'heading') {
      const wrapped = wrap(line.text, 72)
      ensure(wrapped.length * 15 + 18)
      y -= 4
      pages[pageIndex].push(`${LIGHT} rg 38 ${y - wrapped.length * 15 + 4} 519 ${wrapped.length * 15 + 8} re f`)
      wrapped.forEach((value, lineIndex) => text(value, 46, y - lineIndex * 15, index === lines.length - 1 ? 9 : 11, true, index === lines.length - 1 ? MUTED : GREEN))
      y -= wrapped.length * 15 + 11
      continue
    }
    const wrapped = wrap(line.text, line.kind === 'detail' ? 84 : 96)
    const size = line.kind === 'detail' ? 9 : 9
    const leading = line.kind === 'detail' ? 13 : 12
    ensure(wrapped.length * leading + 6)
    wrapped.forEach((value, lineIndex) => text(value, line.kind === 'detail' ? 46 : 42, y - lineIndex * leading, size, line.kind === 'detail'))
    y -= wrapped.length * leading + (line.kind === 'detail' ? 4 : 7)
  }

  const pageCount = pages.length
  const pageObjectStart = 3
  const fontRegularObject = pageObjectStart + pageCount
  const fontBoldObject = fontRegularObject + 1
  const streamObjectStart = fontBoldObject + 1
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${pageObjectStart + index} 0 R`).join(' ')
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`,
  ]
  pages.forEach((_, index) => objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularObject} 0 R /F2 ${fontBoldObject} 0 R >> >> /Contents ${streamObjectStart + index} 0 R >>`))
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  pages.forEach((commands) => {
    const content = commands.join('\n')
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
  })
  let pdf = '%PDF-1.4\n%SecureCleaningAgreement\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
