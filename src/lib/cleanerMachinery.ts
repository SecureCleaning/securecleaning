export const SPECIALIST_MACHINERY = [
  ['carpet_extractor', 'Carpet steam cleaner / extractor'],
  ['multi_wash', 'Multi-wash machine'],
  ['walk_behind_scrubber', 'Walk-behind scrubber'],
  ['rotary_buffer', 'Rotary buffer / polisher'],
  ['other', 'Other equipment'],
] as const

export type CleanerMachinery = { items: string[]; other: string; notes: string }

/** Undefined preserves existing data for older clients; null means not yet provided. */
export function parseCleanerMachinery(value: unknown): CleanerMachinery | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid specialist machinery details.')
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !['items', 'other', 'notes'].includes(key)) || !Array.isArray(data.items) || data.items.length > 5 || data.items.some(item => typeof item !== 'string' || !SPECIALIST_MACHINERY.some(([code]) => code === item))) throw new Error('Select valid specialist machinery options.')
  if (typeof data.other !== 'string' || data.other.length > 200 || typeof data.notes !== 'string' || data.notes.length > 1000) throw new Error('Equipment description must be at most 200 characters and notes at most 1,000 characters.')
  const items = [...new Set(data.items)] as string[]
  const other = items.includes('other') ? data.other.trim() : ''
  if (items.includes('other') && !other) throw new Error('Describe the other equipment available.')
  return { items, other, notes: data.notes.trim() }
}
