export type BroadcastCleanerOption = { id: string; name: string; businessName: string; email: string }

export function searchBroadcastCleaners(cleaners: BroadcastCleanerOption[], query: string) {
  const terms = query.trim().toLocaleLowerCase('en-AU').split(/\s+/).filter(Boolean)
  const compare = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true }).compare
  return cleaners.filter((cleaner) => {
    const text = `${cleaner.name} ${cleaner.businessName} ${cleaner.email}`.toLocaleLowerCase('en-AU')
    return terms.every((term) => text.includes(term))
  }).sort((a, b) => compare(a.name, b.name) || compare(a.businessName, b.businessName) || compare(a.email, b.email) || compare(a.id, b.id))
}
