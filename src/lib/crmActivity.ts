import type { CrmCommunication, CrmInternalNote } from './clientCrmData'
export type CrmActivityTab = 'all' | 'notes' | 'emails'
export type CrmActivityEntry = { kind: 'note'; value: CrmInternalNote; at: string } | { kind: 'email'; value: CrmCommunication; at: string }
export function crmActivity(notes: CrmInternalNote[], emails: CrmCommunication[], tab: CrmActivityTab, notesCursor: string | null = null): CrmActivityEntry[] {
  const entries: CrmActivityEntry[] = [
    ...(tab === 'emails' ? [] : notes.map(value => ({ kind: 'note' as const, value, at: value.createdAt }))),
    ...(tab === 'notes' ? [] : emails.map(value => ({ kind: 'email' as const, value, at: value.sentAt || value.createdAt }))),
  ]
  // Do not show older emails ahead of notes that have not been fetched yet.
  const boundary = tab === 'all' && notesCursor ? Date.parse(notesCursor.split('|')[0]) : -Infinity
  return entries.filter(entry => Date.parse(entry.at) >= boundary)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || `${a.kind}:${a.value.id}`.localeCompare(`${b.kind}:${b.value.id}`))
}
