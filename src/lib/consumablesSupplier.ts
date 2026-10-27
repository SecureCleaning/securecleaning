import sanitizeHtml from 'sanitize-html'
import { parseConsumableVariants, slugifyConsumable, type ConsumableProduct } from './consumablesShared'

// Start with the requested supplier. Do not turn this authenticated endpoint
// into an arbitrary URL proxy (internal hosts, redirects or credentials).
export function supplierUrl(value: unknown, image = false) {
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Enter a valid supplier URL.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['sydneycleaningsupplies.com.au', 'www.sydneycleaningsupplies.com.au'].includes(url.hostname) ||
      !url.pathname.startsWith(image ? '/wp-content/uploads/' : '/shop/')) {
    throw new Error('Use a Sydney Cleaning Supplies product link or image.')
  }
  url.hash = ''
  return url.toString()
}

export async function fetchSupplier(value: unknown, image = false) {
  const url = supplierUrl(value, image)
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body) throw new Error('Supplier could not be reached. Enter the details manually.')
  const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
  if (image ? !['image/jpeg', 'image/png', 'image/webp'].includes(type) : type !== 'text/html') throw new Error('Supplier returned an unsupported file.')
  const limit = image ? 5 * 1024 * 1024 : 3 * 1024 * 1024
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > limit) throw new Error('Supplier file is too large.')
      chunks.push(part.value)
    }
  } finally { await reader.cancel() }
  return { bytes: Buffer.concat(chunks), type, url }
}

function decode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#(?:0*39|x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
function plain(value: string) {
  return decode(sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })).replace(/\s+/g, ' ').trim()
}

export function parseSupplierProduct(html: string, url: string): ConsumableProduct {
  supplierUrl(url)
  const title = plain(html.match(/<h1\b[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')
  if (!title) throw new Error('No product found at this link.')
  const rawOptions = html.match(/data-product_variations="([^"]+)"/i)?.[1]
  const entries = rawOptions ? JSON.parse(decode(rawOptions)) : []
  if (!Array.isArray(entries) || entries.length > 30) throw new Error('Supplier options could not be read. Enter options manually.')
  const description = plain(html.match(/<div class="woocommerce-product-details__short-description">([\s\S]*?)<\/div>/i)?.[1] ?? '')
  const variants = parseConsumableVariants(entries.map((entry) => {
    const label = Object.values(entry.attributes ?? {}).join(' / ').replace(/-/g, ' ').toUpperCase()
    const capacity = label.match(/\d+L/i)?.[0]
    const pack = capacity ? description.match(new RegExp(`${capacity}[^()]*\\(([^)]+)\\)`, 'i'))?.[1] : null
    if (typeof entry.display_price !== 'number' || !Number.isFinite(entry.display_price)) throw new Error('An option has no price. Enter it manually.')
    return { label, supplierSku: entry.sku, packSize: pack ?? 'Confirm pack size', supplierCostCents: Math.round(entry.display_price * 100), finalPriceOverrideCents: null }
  })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
  const priceHtml = html.match(/<p class="price">([\s\S]*?)<\/p>/i)?.[1] ?? ''
  if (!/ex\.\s*GST/i.test(priceHtml)) throw new Error('Cannot confirm whether this supplier price excludes GST. Enter the cost manually.')
  const priceText = plain(priceHtml)
  const price = priceText.match(/Current price is:\s*\$(\d+(?:\.\d+)?)/i)?.[1] ?? priceText.match(/\$(\d+(?:\.\d+)?)/)?.[1]
  if (!variants.length && !price) throw new Error('Supplier price could not be read.')
  const image = decode(html.match(/data-large_image="([^"]+)"/i)?.[1] ?? '')
  const pack = title.match(/\*([^*]+\/CARTON)\*/i)?.[1]?.replace('/CARTON', ' per carton')
  return {
    id: '', slug: slugifyConsumable(title), title, category: 'Bags / bin liners',
    description, supplierSku: variants.length ? '' : plain(html.match(/<span class="sku">([\s\S]*?)<\/span>/i)?.[1] ?? ''),
    packSize: variants.length ? variants[0].packSize : pack ?? 'Confirm pack size',
    supplierCostCents: variants[0]?.supplierCostCents ?? Math.round(Number(price) * 100),
    markupOverrideBps: null, finalPriceOverrideCents: null, variants,
    imageUrl: image ? supplierUrl(image, true) : '', supplierProductUrl: url,
    active: true, sortOrder: 100, updatedAt: null,
  }
}
