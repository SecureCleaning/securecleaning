export type ContractSaleTaxInvoicePdfInput = {
  invoiceTitle: string
  invoiceNumber: string
  issuedOn: string
  dueOn: string | null
  supplierName: string
  supplierAbn: string
  supplierEmail: string
  recipientName: string
  recipientBusiness: string
  recipientAbn?: string | null
  recipientAddress?: string | null
  description: string
  productCode: string
  saleCode: string
  totalIncGstCents: number
  gstComponentCents: number
  depositRequiredIncGstCents: number
  paidCents: number
  paymentTerms: string
  senderName: string
  senderTitle?: string | null
  senderEmail: string
  footerNote: string
}

export type ContractSaleInvoiceTemplateTokens = {
  invoiceNumber: string
  productCode: string
  saleCode: string
  cleanerName: string
  cleanerBusiness: string
  suburb: string
  state: string
  totalIncGst: string
  depositIncGst: string
  balanceIncGst: string
  agentName: string
  agentTitle: string
}

const TEMPLATE_TOKEN_PATTERN = /\{(invoice_number|product_code|sale_code|cleaner_name|cleaner_business|suburb|state|total_inc_gst|deposit_inc_gst|balance_inc_gst|agent_name|agent_title)\}/g

const tokenKey: Record<string, keyof ContractSaleInvoiceTemplateTokens> = {
  invoice_number: 'invoiceNumber', product_code: 'productCode', sale_code: 'saleCode',
  cleaner_name: 'cleanerName', cleaner_business: 'cleanerBusiness', suburb: 'suburb', state: 'state',
  total_inc_gst: 'totalIncGst', deposit_inc_gst: 'depositIncGst', balance_inc_gst: 'balanceIncGst',
  agent_name: 'agentName', agent_title: 'agentTitle',
}

export function renderContractSaleInvoiceTemplateText(template: string, tokens: ContractSaleInvoiceTemplateTokens) {
  return template.replace(TEMPLATE_TOKEN_PATTERN, (_, name: string) => tokens[tokenKey[name]] ?? '')
}

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const GREEN = '0.047 0.463 0.431'
const NAVY = '0.102 0.153 0.267'
const MUTED = '0.350 0.390 0.450'
const LIGHT = '0.945 0.965 0.960'

function ascii(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapePdf(value: unknown) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(Math.round(cents) / 100)
}

function formatDate(value: string | null) {
  if (!value) return 'Before cleaning commences'
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? ascii(value) : new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
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

function createContent(input: ContractSaleTaxInvoicePdfInput) {
  const commands: string[] = []
  const text = (value: unknown, x: number, y: number, size = 10, bold = false, colour = NAVY) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colour} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, colour = '0.820 0.840 0.860', width = 1) => {
    commands.push(`${colour} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
  }
  const fill = (x: number, y: number, width: number, height: number, colour: string) => {
    commands.push(`${colour} rg ${x} ${y} ${width} ${height} re f`)
  }
  const textLines = (lines: string[], x: number, y: number, size = 10, bold = false, colour = NAVY, leading = 14) => {
    lines.forEach((value, index) => text(value, x, y - index * leading, size, bold, colour))
    return y - Math.max(1, lines.length) * leading
  }

  const outstanding = Math.max(0, input.totalIncGstCents - input.paidCents)
  const balanceAfterDeposit = Math.max(0, input.totalIncGstCents - input.depositRequiredIncGstCents)

  fill(0, 760, PAGE_WIDTH, 82, GREEN)
  text(input.supplierName, 42, 804, 23, true, '1 1 1')
  text('Commercial cleaning contracts', 42, 783, 9, false, '1 1 1')
  text(input.invoiceTitle, 414, 802, 18, true, '1 1 1')
  text(input.invoiceNumber, 414, 780, 10, false, '1 1 1')

  text('SUPPLIER', 42, 728, 8, true, GREEN)
  text(input.supplierName, 42, 710, 11, true)
  text(`ABN ${input.supplierAbn}`, 42, 694, 9)
  text(input.supplierEmail, 42, 678, 9)

  text('INVOICE DETAILS', 330, 728, 8, true, GREEN)
  text('Issue date', 330, 710, 9, false, MUTED)
  text(formatDate(input.issuedOn), 420, 710, 9, true)
  text('Balance due', 330, 694, 9, false, MUTED)
  text(formatDate(input.dueOn), 420, 694, 9, true)
  text('Currency', 330, 678, 9, false, MUTED)
  text('AUD', 420, 678, 9, true)

  line(42, 652, 553, 652)
  text('BILL TO', 42, 630, 8, true, GREEN)
  text(input.recipientBusiness, 42, 611, 12, true)
  let recipientY = 595
  if (input.recipientName && input.recipientName !== input.recipientBusiness) {
    text(input.recipientName, 42, recipientY, 9)
    recipientY -= 15
  }
  if (input.recipientAbn) {
    text(`ABN ${input.recipientAbn}`, 42, recipientY, 9)
    recipientY -= 15
  }
  if (input.recipientAddress) textLines(wrap(input.recipientAddress, 58), 42, recipientY, 9, false, MUTED, 13)

  text('REFERENCE', 330, 630, 8, true, GREEN)
  text(`Product ${input.productCode}`, 330, 611, 9, true)
  text(`Product sale ${input.saleCode}`, 330, 595, 9)
  text(`Issued by ${input.senderName}`, 330, 579, 9)

  fill(42, 518, 511, 28, NAVY)
  text('DESCRIPTION', 54, 528, 8, true, '1 1 1')
  text('QTY', 386, 528, 8, true, '1 1 1')
  text('GST', 430, 528, 8, true, '1 1 1')
  text('AMOUNT INC GST', 470, 528, 8, true, '1 1 1')

  const descriptionLines = wrap(input.description, 55).slice(0, 4)
  const itemBottom = Math.min(472, 500 - (descriptionLines.length - 1) * 13)
  textLines(descriptionLines, 54, 496, 9, false, NAVY, 13)
  text('1', 392, 496, 9)
  text('Taxable', 430, 496, 9)
  text(money(input.totalIncGstCents), 478, 496, 9, true)
  line(42, itemBottom, 553, itemBottom)

  const totalsTop = itemBottom - 28
  text('Subtotal excluding GST', 342, totalsTop, 9, false, MUTED)
  text(money(input.totalIncGstCents - input.gstComponentCents), 478, totalsTop, 9, true)
  text('GST', 342, totalsTop - 18, 9, false, MUTED)
  text(money(input.gstComponentCents), 478, totalsTop - 18, 9, true)
  line(342, totalsTop - 29, 553, totalsTop - 29, NAVY)
  text('TOTAL INC GST', 342, totalsTop - 49, 10, true)
  text(money(input.totalIncGstCents), 478, totalsTop - 49, 10, true)

  const paymentBoxY = totalsTop - 145
  fill(42, paymentBoxY, 511, 72, LIGHT)
  text('PAYMENT REQUIRED', 54, paymentBoxY + 52, 8, true, GREEN)
  text('Deposit payable now', 54, paymentBoxY + 30, 11, true)
  text(money(input.depositRequiredIncGstCents), 222, paymentBoxY + 30, 11, true, GREEN)
  text('Remaining balance', 342, paymentBoxY + 30, 9, false, MUTED)
  text(money(balanceAfterDeposit), 458, paymentBoxY + 30, 9, true)
  text(`Outstanding at issue: ${money(outstanding)}`, 54, paymentBoxY + 12, 8, false, MUTED)

  let termsY = paymentBoxY - 28
  text('PAYMENT TERMS', 42, termsY, 8, true, GREEN)
  termsY = textLines(wrap(input.paymentTerms, 100).slice(0, 4), 42, termsY - 19, 9, false, NAVY, 13)
  text(`Use ${input.invoiceNumber} as the payment reference.`, 42, termsY - 3, 9, true)

  line(42, 102, 553, 102)
  const footerLines = wrap(input.footerNote, 105).slice(0, 2)
  textLines(footerLines, 42, 84, 8, false, MUTED, 14)
  text(`Questions: ${input.senderName}${input.senderTitle ? ` - ${input.senderTitle}` : ''} | ${input.senderEmail}`, 42, 48, 8, false, GREEN)
  text('Page 1 of 1', 498, 48, 8, false, MUTED)
  return commands.join('\n')
}

export function buildContractSaleTaxInvoicePdf(input: ContractSaleTaxInvoicePdfInput) {
  const content = createContent(input)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n%SecureCleaning\n'
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
