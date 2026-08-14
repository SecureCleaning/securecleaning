const MAX_SERVICE_AREAS = 30
const MAX_SERVICE_AREA_LENGTH = 80
const DEFAULT_SUFFIX = ' + 20 km'

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function cleanServiceAreas(value: unknown) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const areas: string[] = []
  for (const item of value) {
    const area = cleanText(item, MAX_SERVICE_AREA_LENGTH)
    const key = area.toLowerCase()
    if (!area || seen.has(key)) continue
    seen.add(key)
    areas.push(area)
    if (areas.length === MAX_SERVICE_AREAS) break
  }
  return areas
}

export function defaultCleanerServiceAreas(suburb: unknown) {
  const cleanedSuburb = cleanText(suburb, MAX_SERVICE_AREA_LENGTH - DEFAULT_SUFFIX.length)
  return cleanedSuburb ? [`${cleanedSuburb}${DEFAULT_SUFFIX}`] : []
}

export function normaliseCleanerServiceAreas(value: unknown, suburb: unknown) {
  const areas = cleanServiceAreas(value)
  return areas.length > 0 ? areas : defaultCleanerServiceAreas(suburb)
}

export function cleanerServiceAreasForImportUpdate(value: unknown) {
  const areas = cleanServiceAreas(value)
  return areas.length > 0 ? areas : undefined
}
