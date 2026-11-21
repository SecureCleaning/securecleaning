import type { FirmQuoteDraft } from './quoteWorkflow'
import { getGlobalRoomTaskRates, getRoomScopeTaskDefinitions, getRoomTypeConfigById, getMoppingRate, type QuoteRoomTypeConfig } from './roomTypeConfig'

export function refreshQuotePrices(draft: FirmQuoteDraft, config: QuoteRoomTypeConfig, replaceCustom: boolean, previousConfig: QuoteRoomTypeConfig = config) {
  const unmatched: string[] = []
  const rates = getGlobalRoomTaskRates(config)
  const fields = config.roomTypes.flatMap(room => room.fields)
  const uniqueLabel = <T extends { label: string }>(items: T[], label: string) => {
    const matches = items.filter(item => item.label.trim().toLowerCase() === label.trim().toLowerCase())
    return matches.length === 1 ? matches[0] : undefined
  }
  const roomItems = draft.roomItems.map(room => {
    const type = getRoomTypeConfigById(config, room.type)
    const tasks = type ? getRoomScopeTaskDefinitions(type) : []
    const previousType = getRoomTypeConfigById(previousConfig, room.type)
    const previousTasks = previousType ? getRoomScopeTaskDefinitions(previousType) : []
    const existingTasks = previousTasks.filter(task => !room.quoteTasks?.some(saved => saved.id === task.id))
    const taskDefaultPrices = { ...room.taskDefaultPrices, ...Object.fromEntries(existingTasks.map(task => [task.id, true])) }
    if (!type) unmatched.push(`${room.label}: room type no longer available`)
    const mopping = getMoppingRate(config, room.moppingRateCode)
    return {
      ...room,
      ...(mopping.available ? { moppingMinutesPerSqm: mopping.minutesPerSqm } : {}),
      ...(replaceCustom && type ? { pricingOverride: false, pricingAdjustmentPercent: type.pricingAdjustmentPercent ?? 0, fixedPricePerVisit: type.fixedPricePerVisit ?? 0 } : {}),
      taskDefaultPrices,
      quoteTasks: [...existingTasks, ...(room.quoteTasks ?? [])].map(task => {
        if (!replaceCustom && !taskDefaultPrices[task.id]) return task
        const code = room.taskSourceCodes?.[task.id]
        const source = tasks.find(item => item.id === task.id)
        const rate = code ? rates.find(item => item.code === code) : uniqueLabel(rates, task.label)
        if (source) { taskDefaultPrices[task.id] = true; return { ...task, price: source.price, minutesPerSqm: source.minutesPerSqm, pricingMode: source.pricingMode } }
        if (rate) { taskDefaultPrices[task.id] = true; return { ...task, price: rate.pricePerRoom, minutesPerSqm: rate.minutesPerSqm, pricingMode: rate.pricingMode } }
        unmatched.push(`${room.label}: ${task.label}`)
        return task
      }),
      customMetricFields: room.customMetricFields?.map(field => {
        if (!replaceCustom) return field
        const id = room.fieldSourceIds?.[field.id] ?? field.id
        const own = type?.fields.find(item => item.id === id)
        const candidates = fields.filter(item => item.id === id)
        // Matching IDs can occur in several room types with different prices.
        const samePrice = candidates.length > 0 && candidates.every(item => item.pricePerUnit === candidates[0].pricePerUnit)
        const source = room.fieldSourceIds?.[field.id] ? candidates[0] : own ?? (samePrice ? candidates[0] : undefined) ?? uniqueLabel(fields, field.label)
        if (source) return { ...field, pricePerUnit: source.pricePerUnit }
        unmatched.push(`${room.label}: ${field.label}`)
        return field
      }),
    }
  })
  return { draft: {
    ...draft, roomItems,
    ...(replaceCustom ? { finalPerVisit: '', targetPrice: '', pricingAdjustmentPercent: 0 } : {}),
  }, unmatched }
}
