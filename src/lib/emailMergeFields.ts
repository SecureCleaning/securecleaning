export type EmailMergeField = {
  key: string
  token: string
  label: string
  description: string
  source?: string
}

function field(key: string, label: string, description: string, source = 'Database'): EmailMergeField {
  return { key, token: `<<${key}>>`, label, description, source }
}

export const CLIENT_EMAIL_MERGE_FIELDS = [
  field('first_name', 'First name', "Client contact's first name"),
  field('last_name', 'Last name', "Client contact's surname"),
  field('name', 'Full name', 'Full client contact name'),
  field('company', 'Company', 'Client business or organisation name'),
  field('position_title', 'Position / title', "Client contact's position or title"),
  field('email', 'Email', "Client contact's email address"),
  field('phone', 'Phone', "Client contact's phone number"),
  field('site_name', 'Site name', 'Saved client site name'),
  field('address', 'Street address', 'Saved site street address'),
  field('suburb', 'Suburb', 'Saved site suburb'),
  field('postcode', 'Postcode', 'Saved site postcode'),
  field('city', 'City', 'Saved site city'),
  field('state', 'State', 'Saved site state or service region'),
  field('lead_source', 'Lead source', 'Saved enquiry provider or source'),
] as const satisfies readonly EmailMergeField[]

export const CLEANER_EMAIL_MERGE_FIELDS = [
  field('first_name', 'First name', "Cleaner contact's first name"),
  field('last_name', 'Last name', "Cleaner contact's surname"),
  field('name', 'Full name', 'Full cleaner contact name'),
  field('company', 'Company', 'Cleaner business name'),
  field('email', 'Email', 'Cleaner email address'),
  field('phone', 'Phone', 'Cleaner phone number'),
  field('address', 'Street address', 'Cleaner street address'),
  field('suburb', 'Suburb', 'Cleaner suburb'),
  field('postcode', 'Postcode', 'Cleaner postcode'),
  field('city', 'City', 'Cleaner city'),
  field('state', 'State', 'Cleaner state or service region'),
  field('abn', 'ABN', 'Cleaner business ABN'),
  field('services', 'Services', 'Cleaner services, separated by commas'),
] as const satisfies readonly EmailMergeField[]

export const BROADCAST_EMAIL_MERGE_FIELDS = [
  ...CLEANER_EMAIL_MERGE_FIELDS.map((item) => ({ ...item, source: 'Cleaner database' })),
  field('product_count', 'Product count', 'Number of included products', 'Broadcast selection'),
  field('product_codes', 'Product codes', 'Included product codes', 'Broadcast selection'),
  field('jobs_link', 'Available jobs link', 'State-filtered available-jobs link', 'Broadcast selection'),
  field('sender_name', 'Sender name', 'Selected sender name', 'Team Access'),
  field('sender_title', 'Sender title', 'Selected sender position title', 'Team Access'),
  field('sender_email', 'Sender email', 'Selected sender work email', 'Team Access'),
  field('sender_phone', 'Sender phone', 'Selected sender work phone', 'Team Access'),
] as const satisfies readonly EmailMergeField[]

export const INSPECTION_EMAIL_MERGE_FIELDS = [
  field('client_first_name', 'Client first name', "Client contact's first name", 'Product sale'),
  field('client_name', 'Client full name', 'Client contact name', 'Product sale'),
  field('client_business', 'Client business', 'Client business or organisation', 'Product sale'),
  field('cleaner_first_name', 'Cleaner first name', "Cleaner contact's first name", 'Product sale'),
  field('cleaner_name', 'Cleaner full name', 'Cleaner contact name', 'Product sale'),
  field('cleaner_business', 'Cleaner business', 'Cleaner business name', 'Product sale'),
  field('site_name', 'Site name', 'Saved site name or address', 'Product sale'),
  field('site_address', 'Site address', 'Full inspection address', 'Product sale'),
  field('inspection_date', 'Inspection date', 'Confirmed local appointment date', 'Appointment'),
  field('inspection_time', 'Inspection time', 'Confirmed local appointment time', 'Appointment'),
  field('inspection_duration', 'Duration', 'Inspection duration in minutes', 'Appointment'),
  field('inspection_location', 'Inspection location', 'Confirmed appointment location', 'Appointment'),
  field('sale_code', 'Product sale reference', 'Product sale code', 'Product sale'),
  field('product_code', 'Product code', 'Cleaning contract product code', 'Product sale'),
  field('sender_name', 'Sender name', 'Sending staff member', 'Team Access'),
  field('sender_title', 'Sender title', 'Sending staff position title', 'Team Access'),
  field('sender_email', 'Sender email', 'Sending staff email', 'Team Access'),
  field('sender_phone', 'Sender phone', 'Sending staff phone', 'Team Access'),
] as const satisfies readonly EmailMergeField[]

export const INSPECTION_EMAIL_MERGE_FIELD_KEYS = new Set(INSPECTION_EMAIL_MERGE_FIELDS.map((item) => item.key))

const LEGACY_CLIENT_KEYS = ['contact_name', 'business_name', 'site_address', 'source_provider']
const LEGACY_CLEANER_KEYS = ['contact_name', 'business_name', 'cleaner_email']

export const CLIENT_EMAIL_MERGE_FIELD_KEYS = new Set([
  ...CLIENT_EMAIL_MERGE_FIELDS.map((item) => item.key),
  ...LEGACY_CLIENT_KEYS,
])

export const CLEANER_EMAIL_MERGE_FIELD_KEYS = new Set([
  ...CLEANER_EMAIL_MERGE_FIELDS.map((item) => item.key),
  ...LEGACY_CLEANER_KEYS,
])

export const BROADCAST_EMAIL_MERGE_FIELD_KEYS = new Set([
  ...BROADCAST_EMAIL_MERGE_FIELDS.map((item) => item.key),
  ...LEGACY_CLEANER_KEYS,
])

// Angle-bracket fields are HTML-encoded by the rich-text editor, so all three
// forms are recognised. Double-brace fields remain supported for old templates.
const MERGE_FIELD_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}|<<\s*([a-z][a-z0-9_]*)\s*>>|&lt;&lt;\s*([a-z][a-z0-9_]*)\s*&gt;&gt;/gi
const ANY_MERGE_FIELD_PATTERN = /\{\{\s*([^{}]{1,80}?)\s*\}\}|<<\s*([^<>]{1,80}?)\s*>>|&lt;&lt;\s*(.{1,80}?)\s*&gt;&gt;/gi

export function applyEmailMergeFields(value: string, values: Record<string, string>) {
  return value.replace(MERGE_FIELD_PATTERN, (match, braces: string | undefined, angles: string | undefined, encodedAngles: string | undefined) => {
    const key = String(braces ?? angles ?? encodedAngles ?? '').toLowerCase()
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  })
}

export function findEmailMergeFieldKeys(...values: string[]) {
  const keys = new Set<string>()
  for (const value of values) {
    for (const match of value.matchAll(new RegExp(MERGE_FIELD_PATTERN.source, MERGE_FIELD_PATTERN.flags))) {
      keys.add(String(match[1] ?? match[2] ?? match[3] ?? '').toLowerCase())
    }
  }
  return [...keys]
}

export function findUnsupportedEmailMergeFields(allowedKeys: ReadonlySet<string>, ...values: string[]) {
  const unsupported = new Set<string>()
  for (const value of values) {
    for (const match of value.matchAll(new RegExp(ANY_MERGE_FIELD_PATTERN.source, ANY_MERGE_FIELD_PATTERN.flags))) {
      const key = String(match[1] ?? match[2] ?? match[3] ?? '').trim().toLowerCase()
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !allowedKeys.has(key)) unsupported.add(`<<${key}>>`)
    }
  }
  return [...unsupported]
}

export function appendEmailMergeField(value: string, token: string) {
  const spacer = value && !/\s$/.test(value) ? ' ' : ''
  return `${value}${spacer}${token}`
}
