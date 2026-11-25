/** Default end for a block-out: one elapsed hour after its saved ISO start. */
export function defaultBlockoutEnd(startsAt: string): string {
  if (!startsAt) return ''
  const timestamp = Date.parse(startsAt)
  if (!Number.isFinite(timestamp)) return ''
  const end = new Date(timestamp + 60 * 60 * 1000)
  return Number.isNaN(end.getTime()) ? '' : end.toISOString()
}
