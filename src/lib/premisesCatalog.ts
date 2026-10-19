export type PremisesOption = { code: string; label: string; active: boolean; updated_at?: string }

export function premisesLabel(code: unknown, other: unknown, options: PremisesOption[] = []) {
  const value = typeof code === 'string' ? code : ''
  if (value === 'other' && typeof other === 'string' && other.trim()) return other.trim()
  return options.find(option => option.code === value)?.label || value.replaceAll('_', ' ')
}

export function parsePremisesSelection(input: Record<string, unknown>) {
  if (!('premisesType' in input)) return { type: null, other: '' }
  if (input.premisesType === null) return { type: '', other: '' }
  if (typeof input.premisesType !== 'string' || (input.premisesType && !/^[a-z][a-z0-9_]{0,59}$/.test(input.premisesType))) throw new Error('Select a valid premises type.')
  const other = typeof input.premisesTypeOther === 'string' ? input.premisesTypeOther.trim() : ''
  if (input.premisesType === 'other' && (!other || other.length > 100)) throw new Error('Describe the other premises type (up to 100 characters).')
  return { type: input.premisesType, other: input.premisesType === 'other' ? other : '' }
}
