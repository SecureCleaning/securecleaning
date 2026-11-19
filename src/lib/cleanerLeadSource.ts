export const CLEANER_LEAD_SOURCES = [
  { value: 'gumtree', label: 'Gumtree advertisement' },
  { value: 'referral', label: 'Referral' },
  { value: 'relationship', label: 'Existing relationship' },
  { value: 'telemarketing', label: 'Telemarketing company' },
  { value: 'website', label: 'Website enquiry' },
  { value: 'social_media', label: 'Social media' },
  { value: 'other', label: 'Other' },
] as const

export type CleanerLeadSource = (typeof CLEANER_LEAD_SOURCES)[number]['value']

export function parseCleanerLeadSource(value: unknown): CleanerLeadSource | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('Select a valid cleaner source.')
  const text = value.trim().toLowerCase()
  if (!text) return null
  const source = CLEANER_LEAD_SOURCES.find((item) => item.value === text || item.label.toLowerCase() === text)
  if (!source) throw new Error('Select a valid cleaner source.')
  return source.value
}

export function parseCleanerLeadSourceDetails(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || value.trim().length > 1000) {
    throw new Error('Cleaner source details must be text of no more than 1,000 characters.')
  }
  return value.trim() || null
}
