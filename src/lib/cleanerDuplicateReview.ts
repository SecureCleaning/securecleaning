export type CleanerMatch = { id: string; name: string; email: string; phone: string; reasons: string[] }
export const cleanerReviewLabels: Record<string, string> = {
  businessName: 'Business', firstName: 'First name', lastName: 'Surname', email: 'Email', phone: 'Mobile', alternatePhone: 'Alternate phone',
  address: 'Address', suburb: 'Suburb', postcode: 'Postcode', city: 'City', state: 'State', abn: 'ABN', leadSource: 'Source', leadSourceDetails: 'Source details',
  services: 'Services', serviceAreas: 'Service areas', preferredWork: 'Preferred work', specialistMachinery: 'Machinery', status: 'Status', complianceStatus: 'Compliance',
  insuranceExpiry: 'Insurance expiry', policeCheckExpiry: 'Police check expiry', inductionExpiry: 'Induction expiry', workingWithChildrenCheck: 'Working with children check', internalOwner: 'Internal owner', rating: 'Rating', notes: 'Notes',
}
const text = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
export function cleanerPhoneKey(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.startsWith('61') && digits.length === 11 ? `0${digits.slice(2)}` : digits
}
export function cleanerMatchReasons(draft: Record<string, unknown>, row: Record<string, unknown>) {
  const reasons: string[] = []
  if (text(draft.email) && text(draft.email) === text(row.email)) reasons.push('Email')
  const phones = [draft.phone, draft.alternatePhone].map(cleanerPhoneKey).filter(p => p.length >= 8)
  if ([row.phone, row.alternate_phone].some(p => phones.includes(cleanerPhoneKey(p)))) reasons.push('Phone')
  if (text(draft.firstName) && text(draft.lastName) && text(`${draft.firstName} ${draft.lastName}`) === text(row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.contact_name)) reasons.push('Full name')
  return reasons
}
export function reviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
export type ReviewChoice = 'existing' | 'incoming' | 'both'
export function prepareCleanerReview<T extends object>(existing: T, incoming: T, choices: Record<string, ReviewChoice>): T {
  const result = { ...existing } as Record<string, unknown>
  const oldValues = existing as Record<string, unknown>
  const newValues = incoming as Record<string, unknown>
  const retained: string[] = []
  for (const [key, label] of Object.entries(cleanerReviewLabels)) {
    const oldValue = reviewValue(oldValues[key]), newValue = reviewValue(newValues[key])
    if (oldValue === newValue || !newValue) continue
    if (key === 'notes') { retained.push(`Submitted notes: ${newValue}`); continue }
    if (choices[key] === 'incoming') {
      result[key] = newValues[key]
      if (oldValue) retained.push(`Previous ${label}: ${oldValue}`)
    } else if (choices[key] === 'both') retained.push(`Additional ${label}: ${newValue}`)
  }
  if (retained.length) result.notes = [reviewValue(oldValues.notes), '[Cleaner details review]', ...retained].filter(Boolean).join('\n')
  return result as T
}
