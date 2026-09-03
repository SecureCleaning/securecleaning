export function getTomorrowDateString(now = new Date()): string {
  const tomorrow = new Date(now)
  tomorrow.setHours(12, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-')
}

export function parseOptionalFloorArea(value: string): number | undefined {
  if (!value.trim()) return undefined
  return Number(value)
}
