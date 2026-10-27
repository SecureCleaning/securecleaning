import { readXlsxRows } from '@/lib/xlsxSafety'
import { MAX_CONSUMABLE_PRODUCTS, parseConsumableVariants, slugifyConsumable, type ConsumableProduct } from '@/lib/consumablesShared'

export type ConsumablesImportPreview = {
  products: ConsumableProduct[]
  warnings: string[]
}

type Row = Array<string | number | boolean | null>

const HEADER_ALIASES: Record<string, string[]> = {
  title: ['title', 'product', 'product title', 'name'],
  description: ['description', 'product description'],
  category: ['category'],
  supplierSku: ['supplier sku', 'sku', 'product code', 'supplier product code'],
  packSize: ['pack size', 'carton size', 'unit size'],
  supplierCost: ['supplier cost', 'cost', 'cost ex gst', 'wholesale cost'],
  markupPercent: ['markup %', 'markup percent', 'markup'],
  finalPrice: ['final price', 'sell price', 'customer price'],
  imageUrl: ['image url'],
  supplierProductUrl: ['supplier url', 'supplier product url', 'product url'],
  active: ['active'],
  variants: ['options json'],
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value ?? '').replace(/[$,%\s]/g, '')
  if (!cleaned) return null
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

function booleanValue(value: unknown) {
  const candidate = normalized(value)
  return !['false', 'no', 'n', '0', 'inactive', 'archived'].includes(candidate)
}

function parseCsv(input: string): Row[] {
  const rows: Row[] = []
  let row: Row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      if (row.length >= 64) throw new Error('Spreadsheet has too many columns.')
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (rows.length >= 2000) throw new Error('Spreadsheet has too many rows.')
      rows.push(row)
      row = []
      field = ''
    } else field += character
  }
  row.push(field.replace(/\r$/, ''))
  if (row.some((value) => String(value).trim())) rows.push(row)
  if (rows.length > 2000 || rows.some((entry) => entry.length > 64)) throw new Error('Spreadsheet dimensions exceed import limits.')
  return rows
}

async function readRows(file: File): Promise<{ rows: Row[]; formulas: Map<string, string> }> {
  const formulas = new Map<string, string>()
  if (file.name.toLowerCase().endsWith('.csv')) {
    return { rows: parseCsv(await file.text()), formulas }
  }
  const result = await readXlsxRows(Buffer.from(await file.arrayBuffer()))
  return { rows: result.rows, formulas: new Map(result.formulas) }
}

function findHeader(rows: Row[]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const cells = rows[rowIndex].map(normalized)
    const mapping: Record<string, number> = {}
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const column = cells.findIndex((value) => aliases.includes(value))
      if (column >= 0) mapping[field] = column
    }
    if (mapping.title !== undefined && (mapping.supplierCost !== undefined || mapping.finalPrice !== undefined)) {
      return { rowIndex, mapping }
    }
  }
  return null
}

function baseProduct(title: string, index: number): ConsumableProduct {
  return {
    id: '', slug: slugifyConsumable(title) || `product-${index + 1}`, category: 'Other', supplierSku: '', title,
    description: '', packSize: '', supplierCostCents: 0, markupOverrideBps: null, finalPriceOverrideCents: null,
    imageUrl: '', supplierProductUrl: '', active: true, sortOrder: index, updatedAt: null,
  }
}

function parseStructuredRows(rows: Row[], header: NonNullable<ReturnType<typeof findHeader>>) {
  return rows.slice(header.rowIndex + 1).flatMap((row, index) => {
    const read = (field: string) => header.mapping[field] === undefined ? null : row[header.mapping[field]]
    const title = String(read('title') ?? '').trim()
    if (!title) return []
    const product = baseProduct(title, index)
    const cost = numberValue(read('supplierCost'))
    const markup = numberValue(read('markupPercent'))
    const finalPrice = numberValue(read('finalPrice'))
    product.description = String(read('description') ?? '').trim()
    product.category = String(read('category') ?? '').trim() || 'Other'
    product.supplierSku = String(read('supplierSku') ?? '').trim()
    product.packSize = String(read('packSize') ?? '').trim()
    product.supplierCostCents = Math.round((cost ?? 0) * 100)
    product.markupOverrideBps = markup === null ? null : Math.round(markup * 100)
    product.finalPriceOverrideCents = finalPrice === null ? null : Math.round(finalPrice * 100)
    product.imageUrl = String(read('imageUrl') ?? '').trim()
    product.supplierProductUrl = String(read('supplierProductUrl') ?? '').trim()
    product.active = booleanValue(read('active'))
    if (read('variants') !== null) product.variants = parseConsumableVariants(JSON.parse(String(read('variants') || '[]')))
    return [product]
  })
}

function parseLegacyRows(rows: Row[], formulas: Map<string, string>, warnings: string[]) {
  const products: ConsumableProduct[] = []
  rows.forEach((row, rowIndex) => {
    for (let column = 0; column <= row.length - 3; column += 1) {
      const titleValue = row[column]
      const descriptionValue = row[column + 1]
      const title = typeof titleValue === 'string' ? titleValue.trim() : ''
      const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
      const displayedPrice = numberValue(row[column + 2])
      if (!title || !description || displayedPrice === null) continue
      const product = baseProduct(title, products.length)
      product.description = description
      const packLine = description.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean).at(-1) ?? ''
      product.packSize = packLine.slice(0, 240)
      const formula = formulas.get(`${rowIndex + 1}:${column + 3}`)?.replace(/^=/, '').replace(/\s/g, '') ?? ''
      const formulaMatch = formula.match(/^(-?\d+(?:\.\d+)?)\*1\.2$/)
      const rawCost = formulaMatch ? Number(formulaMatch[1]) : displayedPrice / 1.2
      if (rawCost < 0) {
        warnings.push(`${title}: negative supplier cost was corrected to ${Math.abs(rawCost).toFixed(2)} for review.`)
      }
      product.supplierCostCents = Math.round(Math.abs(rawCost) * 100)
      product.markupOverrideBps = 2000
      products.push(product)
      break
    }
  })
  return products
}

export async function parseConsumablesImportFile(file: File): Promise<ConsumablesImportPreview> {
  if (file.size <= 0) throw new Error('Choose a non-empty spreadsheet.')
  if (file.size > 5 * 1024 * 1024) throw new Error('The spreadsheet must be 5 MB or smaller.')
  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) throw new Error('Use an .xlsx or .csv file.')
  const { rows, formulas } = await readRows(file)
  const warnings: string[] = []
  const header = findHeader(rows)
  const products = header ? parseStructuredRows(rows, header) : parseLegacyRows(rows, formulas, warnings)
  if (products.length === 0) throw new Error('No consumable products were found in the spreadsheet.')
  if (products.length > MAX_CONSUMABLE_PRODUCTS) throw new Error(`Imports are limited to ${MAX_CONSUMABLE_PRODUCTS} products.`)
  return { products, warnings }
}
