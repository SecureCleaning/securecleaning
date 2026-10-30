import { csvCell } from '@/lib/csvCell'
import { isValidCrmEmail, CRM_CONTACT_BASES, CRM_SOURCE_TYPES } from '@/lib/clientCrmPolicy'
import { crmPostcodeMatchesRegion } from '@/lib/clientCrmLocation'
import type { PremisesOption } from '@/lib/premisesCatalog'
export const LEAD_CSV_COLUMNS = ['business_name', 'first_name', 'last_name', 'email', 'phone', 'address', 'suburb', 'postcode', 'city', 'premises_type', 'premises_type_other', 'source_type', 'contact_basis', 'source_provider', 'source_reference', 'notes'] as const
// Accept human-readable labels without guessing a lead's contact permission.
function choiceKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '_')
}
const SOURCE_ALIASES: Record<string, string> = { manual_entry: 'manual', purchased_leads: 'purchased_lead', official_website: 'cold_outreach' }
const BASIS_ALIASES: Record<string, string> = {
  client_enquiry: 'enquiry', inquiry: 'enquiry', client_inquiry: 'enquiry',
  purchased_lead_provider: 'purchased_lead', existing_business_relationship: 'existing_relationship',
  relevant_published_business_contact: 'inferred_business_interest', public_business_contact: 'inferred_business_interest',
}
const PREMISES_ALIASES: Record<string, string> = {
  childcare_centre: 'childcare', childcare_center: 'childcare', child_care: 'childcare',
  child_care_centre: 'childcare', child_care_center: 'childcare',
}
function normalizeChoice(value: string, aliases: Record<string, string>) {
  const key = choiceKey(value)
  return Object.hasOwn(aliases, key) ? aliases[key] : key
}
export function leadCsv(rows: Record<string, unknown>[]) {
  return '\uFEFF' + [LEAD_CSV_COLUMNS.map(csvCell).join(','), ...rows.map(row => LEAD_CSV_COLUMNS.map(key => csvCell(row[key])).join(','))].join('\r\n')
}
export function parseLeadCsv(text: string, options: PremisesOption[]) {
  if (text.length > 500_000) throw new Error('CSV must be smaller than 500 KB.')
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') { quoted = false; closed = true }
      else cell += ch
    } else if (ch === '"' && !cell && !closed) quoted = true
    else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(cell); cell = ''; closed = false
      if (ch !== ',') { if (row.some(value => value.trim())) rows.push(row); row = []; if (ch === '\r' && source[i + 1] === '\n') i++ }
    } else { if (closed || ch === '"') throw new Error('Malformed CSV quoting. Save the file as CSV and retry.'); cell += ch }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.')
  row.push(cell); if (row.some(value => value.trim())) rows.push(row)
  const headers = rows.shift()?.map(value => value.trim().toLowerCase()) ?? []
  if (!headers.length || new Set(headers).size !== headers.length || headers.some(value => !(LEAD_CSV_COLUMNS as readonly string[]).includes(value))) throw new Error('Use the downloadable template: CSV headers are missing, duplicated, or unknown.')
  for (const required of ['email', 'postcode', 'city', 'contact_basis']) if (!headers.includes(required)) throw new Error(`Missing column: ${required}.`)
  if (!rows.length || rows.length > 200) throw new Error('Import between 1 and 200 leads at a time.')
  const seen = new Set<string>()
  return rows.map((values, index) => {
    const record = Object.fromEntries(headers.map((header, i) => [header, (values[i] ?? '').trim()]))
    const errors: string[] = []
    if (values.length !== headers.length) errors.push('Column count does not match the header')
    record.first_name ||= 'Manager'
    if (!isValidCrmEmail(record.email || '')) errors.push('Valid email is required')
    record.email = (record.email || '').toLowerCase()
    record.city = ({ nsw: 'sydney', vic: 'melbourne', qld: 'brisbane', queensland: 'brisbane' } as Record<string, string>)[record.city?.toLowerCase()] || record.city?.toLowerCase()
    if (!['sydney', 'melbourne', 'brisbane'].includes(record.city)) errors.push('City must be sydney/NSW, melbourne/VIC or brisbane/QLD')
    else if (!/^\d{4}$/.test(record.postcode) || !crmPostcodeMatchesRegion(record.postcode, record.city as 'sydney' | 'melbourne' | 'brisbane')) errors.push('Postcode must match the service region')
    record.source_type = normalizeChoice(record.source_type || 'manual', SOURCE_ALIASES)
    record.contact_basis = normalizeChoice(record.contact_basis || '', BASIS_ALIASES)
    if (!(CRM_SOURCE_TYPES as readonly string[]).includes(record.source_type)) errors.push(`Invalid source_type \"${record.source_type}\". Use: Manual entry, Online quote, Purchased lead, Cold outreach or Direct booking.`)
    if (!(CRM_CONTACT_BASES as readonly string[]).includes(record.contact_basis)) errors.push(`Invalid contact_basis \"${record.contact_basis}\". Use: Client enquiry, Purchased lead provider, Existing business relationship or Relevant published business contact.`)
    if ((['purchased_lead', 'cold_outreach'].includes(record.source_type) || ['purchased_lead', 'inferred_business_interest'].includes(record.contact_basis)) && !record.source_provider) errors.push('Source provider is required')
    if (record.premises_type) {
      // Respect exact catalog matches (including inactive entries) before aliases.
      const key = choiceKey(record.premises_type)
      const exact = options.find(option => choiceKey(option.code) === key || choiceKey(option.label) === key)
      const option = exact || options.find(option => option.code === normalizeChoice(record.premises_type, PREMISES_ALIASES))
      if (!option?.active) errors.push(`Unknown or inactive premises type \"${record.premises_type}\". Use an active catalog name/code, or Other with premises_type_other filled in.`)
      else record.premises_type = option.code
    }
    if (record.premises_type === 'other' && !record.premises_type_other) errors.push('Describe the other premises type')
    const limits: Record<string, number> = { business_name: 200, first_name: 100, last_name: 100, email: 254, phone: 40, address: 300, suburb: 120, premises_type_other: 100, source_provider: 200, source_reference: 200, notes: 5000 }
    for (const [key, limit] of Object.entries(limits)) if ((record[key] || '').length > limit) errors.push(`${key} exceeds ${limit} characters`)
    const identity = [record.email, record.address, record.suburb, record.postcode, record.city].join('|').toLowerCase()
    if (seen.has(identity)) errors.push('Duplicate lead in this CSV')
    seen.add(identity)
    const input = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), value]))
    return { row: index + 2, record, input, errors }
  })
}

export function normalizeExcludedLeadCsvRows(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(row => !Number.isInteger(row) || row < 2 || row > 201)) {
    throw new Error('Excluded CSV rows are invalid. Preview the file again and retry.')
  }
  return [...new Set(value as number[])]
}

export function partitionLeadCsvRows<T extends { row: number }>(rows: T[], excludedRows: readonly number[]) {
  const excluded = new Set(excludedRows)
  return {
    included: rows.filter(row => !excluded.has(row.row)),
    excluded: rows.filter(row => excluded.has(row.row)),
  }
}

