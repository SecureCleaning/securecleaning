import type { WorkflowRoomItem } from '@/lib/quoteWorkflow'

export function moveQuoteRoom(rooms: WorkflowRoomItem[], roomId: string, targetId: string): WorkflowRoomItem[] {
  const from = rooms.findIndex((room) => room.id === roomId)
  const to = rooms.findIndex((room) => room.id === targetId)
  if (from < 0 || to < 0 || from === to) return rooms
  const reordered = [...rooms]
  const [room] = reordered.splice(from, 1)
  reordered.splice(to, 0, room)
  return reordered
}

export function duplicateQuoteRoom(rooms: WorkflowRoomItem[], roomId: string, newId: string): WorkflowRoomItem[] {
  const index = rooms.findIndex((room) => room.id === roomId)
  if (index < 0 || !newId.trim() || rooms.some((room) => room.id === newId)) return rooms
  const copy = structuredClone(rooms[index])
  copy.id = newId
  copy.label = `${copy.label || copy.type} (copy)`
  return [...rooms.slice(0, index + 1), copy, ...rooms.slice(index + 1)]
}
