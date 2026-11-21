export type QuoteSectionTitle = { id: string; label: string; beforeRoomId: string | null }

export function quoteEntries<T extends { id: string; label: string }>(rooms: T[], sections: QuoteSectionTitle[] = []) {
  const entries: Array<({ kind: 'room' } & T) | ({ kind: 'section' } & QuoteSectionTitle)> = []
  for (const room of rooms) {
    entries.push(...sections.filter(section => section.beforeRoomId === room.id).map(section => ({ ...section, kind: 'section' as const })))
    entries.push({ ...room, kind: 'room' })
  }
  entries.push(...sections.filter(section => !rooms.some(room => room.id === section.beforeRoomId)).map(section => ({ ...section, kind: 'section' as const })))
  return entries
}

export function moveQuoteEntry<T extends { id: string; label: string }>(rooms: T[], sections: QuoteSectionTitle[], id: string, targetId: string) {
  const entries = quoteEntries(rooms, sections)
  const from = entries.findIndex(entry => entry.id === id)
  const to = entries.findIndex(entry => entry.id === targetId)
  if (from < 0 || to < 0 || from === to) return { roomItems: rooms, sectionTitles: sections }
  const [entry] = entries.splice(from, 1)
  entries.splice(to, 0, entry)
  return {
    roomItems: entries.filter(item => item.kind === 'room').map(item => rooms.find(room => room.id === item.id)!),
    sectionTitles: entries.flatMap((item, index) => item.kind === 'section' ? [{ id: item.id, label: item.label, beforeRoomId: entries.slice(index + 1).find(next => next.kind === 'room')?.id ?? null }] : []),
  }
}
