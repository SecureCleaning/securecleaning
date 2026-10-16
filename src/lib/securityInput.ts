type Rule = (value: unknown) => boolean
const children = new WeakMap<Rule, (value: unknown) => Array<[string, unknown, Rule]>>()
const number = (max: number, min = 0, integer = false): Rule => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))
const string = (max = 10000): Rule => value => typeof value === 'string' && value.length <= max
const boolean: Rule = value => typeof value === 'boolean'
const choice = (...values: string[]): Rule => value => typeof value === 'string' && values.includes(value)
const array = (rule: Rule, max: number): Rule => {
  const check: Rule = value => Array.isArray(value) && value.length <= max && value.every(rule)
  children.set(check, value => Array.isArray(value) && value.length <= max ? value.map((item, index) => [String(index + 1), item, rule]) : [])
  return check
}
const object = (rules: Record<string, Rule>): Rule => {
  const check: Rule = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, item]) => Object.prototype.hasOwnProperty.call(rules, key) && rules[key](item))
  children.set(check, value => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).map(([key, item]) => [Object.prototype.hasOwnProperty.call(rules, key) ? key : 'unsupported field', item, Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : (() => false)]) : [])
  return check
}
const dictionary = (rule: Rule, max = 100, keyRule: Rule = key => typeof key === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(key)): Rule => value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= max && Object.entries(value).every(([key, item]) => keyRule(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && rule(item))
const frequency = choice('daily', '3x_week', '2x_week', 'weekly', 'fortnightly', 'monthly', 'once_off')
const addOns = object({ bathrooms: number(1000, 0, true), kitchens: number(1000, 0, true), windows: number(10000, 0, true), glassCleaningRequired: boolean, consumables: boolean, highTouchDisinfection: boolean, carpetSteam: boolean })
const roomScope = array(object({ id: string(128), type: choice('bathroom', 'female_bathroom', 'male_bathroom', 'accessible_bathroom', 'kitchen', 'meeting_room', 'reception', 'hallway', 'stairs', 'breakout', 'warehouse', 'other'), label: string(200), quantity: number(1000, 1, true), moppingRequired: boolean, isCustom: boolean }), 40)
const inputRules: Record<string, Rule> = {
  businessName: string(120), contactName: string(120), email: string(254), phone: string(40), city: choice('melbourne', 'sydney'), address: string(500), suburb: string(80), postcode: string(12), latitude: number(90, -90), longitude: number(180, -180), premisesType: choice('office', 'medical', 'industrial', 'childcare', 'retail', 'gym', 'warehouse', 'function_centre', 'sports_facility', 'other'), floorArea: number(1000000, 0.01), floors: number(200, 1, true), flooringType: choice('carpet', 'hard_floor', 'mixed'), meetingRooms: number(1000, 0, true), roomScope, frequency, timePreference: choice('business_hours', 'after_hours', 'weekend'), isSpringClean: boolean, addOns, notes: string(1500), heardAboutUs: string(200), preferredStartDate: string(40), smsQuoteNoticeVersion: string(64), smsQuoteEmailOnly: boolean, acceptableUseAccepted: boolean, formStartedAt: number(Number.MAX_SAFE_INTEGER), website: string(500), companyWebsiteUrl: string(500), faxNumber: string(100), middleName: string(100),
}
export const validQuoteInput = object(inputRules)
export function validPublicQuoteInput(value: unknown) {
  return validQuoteInput(value) && !!value && typeof value === 'object' && 'floorArea' in value && 'addOns' in value
}
const metric = object({ id: string(64), label: string(200), inputType: choice('boolean', 'number', 'integer'), defaultValue: value => boolean(value) || number(1000000)(value), includedUnits: number(1000000), pricePerUnit: number(1000000), cadence: choice('every_clean', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually', 'as_needed', 'alternate_days'), helpText: string(120) })
// Configured metric IDs historically include labels such as "Entrance Doors".
// Keep bounded printable keys; dictionary still rejects prototype-related names.
const metricKey: Rule = key => typeof key === 'string' && key.trim().length > 0 && key.length <= 128 && !/[\u0000-\u001f\u007f]/.test(key)
const room = object({ id: string(128), type: value => metricKey(value) && !['__proto__', 'prototype', 'constructor'].includes(value as string), label: string(200), description: string(2000), quantity: number(1000, 1, true), size: number(1000000), floor: number(200, 0, true), metrics: dictionary(value => boolean(value) || number(1000000)(value), 100, metricKey), customMetricFields: array(metric, 20), excludedMetricFieldIds: array(string(64), 30), scopeTaskSelections: dictionary(boolean), moppingRateCode: string(64), moppingEnabled: boolean, moppingMinutesPerSqm: number(1000), pricingOverride: boolean, pricingAdjustmentPercent: number(1000, -100), fixedPricePerVisit: number(1000000) })
const price: Rule = value => typeof value === 'string' && (value === '' || /^\d{1,7}(\.\d{1,2})?$/.test(value) && Number(value) <= 1000000)
const reportRules: Record<string, Rule> = Object.fromEntries(['inspectorName', 'inspectedAt', 'siteContact', 'accessNotes', 'parkingNotes', 'alarmNotes', 'summary', 'recommendedStartDate', 'exclusions', 'riskNotes', 'followUpActions'].map(key => [key, string()]))
reportRules.recommendedFrequency = frequency
export const validWorkflowInput = object({ inspectionReport: object(reportRules), firmQuoteDraft: object({ status: choice('draft', 'reviewed', 'sent', 'accepted'), revisedInputs: validQuoteInput, roomItems: array(room, 100), moppingMinutesPerSqm: number(1000), pricingAdjustmentPercent: number(1000, -100), targetPrice: price, finalPerVisit: price, scopeSummary: string(), inclusions: string(), exclusions: string(), serviceCommentary: string(), includeConsumablesCatalogue: boolean }), revision: boolean, expectedDocumentVersion: number(Number.MAX_SAFE_INTEGER, 1, true), initializeAccepted: boolean, expectedUpdatedAt: string(64) })
export function validChatInput(value: unknown): value is { messages: {role: 'user' | 'assistant'; content: string}[]; sessionToken?: string } {
  if (!object({ messages: array(object({ role: choice('user', 'assistant'), content: string(1200) }), 12), sessionToken: string(256) })(value)) return false
  const messages = (value as {messages?: {role?: string; content?: string}[]}).messages
  return !!messages?.length && messages.every(message => !!message.role && typeof message.content === 'string' && message.content.trim().length > 0) && messages.reduce((sum, message) => sum + new TextEncoder().encode(message.content).byteLength, 0) <= 12000
}
export function allNumbersFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e12
  if (value && typeof value === 'object') return Object.values(value).every(allNumbersFinite)
  return true
}

/** Bound legacy decoded records before merging, expanding room tasks or rendering. */
export function assertStoredDocumentBounded(value: unknown, maxBytes: number) {
  let bytes = 0
  let nodes = 0
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 20000 || depth > 12) throw new Error('Quote document needs administrator review: stored document exceeds supported limits.')
    if (typeof item === 'string') {
      if (item.length > 10000) throw new Error('Quote document needs administrator review: stored text exceeds supported limits.')
      bytes += new TextEncoder().encode(item).byteLength + 2
    } else if (item && typeof item === 'object') {
      const entries = Object.entries(item)
      if (entries.length > (Array.isArray(item) ? 1000 : 200)) throw new Error('Quote document needs administrator review: stored collection exceeds supported limits.')
      for (const [key, child] of entries) { bytes += key.length + 4; visit(child, depth + 1) }
    } else {
      if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Quote document needs administrator review: invalid stored number.')
      bytes += 24
    }
    if (bytes > maxBytes) throw new Error('Quote document needs administrator review: stored document exceeds supported limits.')
  }
  visit(value, 0)
}

/** Return only schema paths, never customer values, in validation feedback. */
export function getWorkflowInputError(value: unknown): string | null {
  function find(rule: Rule, item: unknown, path: string): string | null {
    if (rule(item)) return null
    for (const [key, child, childRule] of children.get(rule)?.(item) ?? []) {
      const error = find(childRule, child, path ? `${path}.${key}` : key)
      if (error) return error
    }
    return path || 'quote document'
  }
  const path = find(validWorkflowInput, value, '')
  return path ? `Please check ${path}: its value is invalid or exceeds the supported limit. Your changes have not been saved.` : null
}
