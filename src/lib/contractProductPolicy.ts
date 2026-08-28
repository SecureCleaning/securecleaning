import type { FinalQuoteDocument } from '@/lib/quoteWorkflowData'
import { getRoomTypeConfigById } from '@/lib/roomTypeConfig'
import type { AdminRole } from '@/lib/staffAccounts'

export const CONTRACT_PRODUCT_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] as const
export const CONTRACT_PRODUCT_STATUSES = ['draft', 'available', 'reserved', 'sold', 'withdrawn'] as const

export type ContractProductState = (typeof CONTRACT_PRODUCT_STATES)[number]
export type ContractProductStatus = (typeof CONTRACT_PRODUCT_STATUSES)[number]

export type CleanerScopeSnapshotV1 = {
  formatVersion: 1
  state: ContractProductState
  suburb: string
  premisesType: string
  floorArea: number
  floors: number
  frequency: string
  timePreference: string
  estimatedHours: number
  summary: string
  rooms: Array<{
    type: string
    label: string
    quantity: number
    size: number
    floor: number
    tasks: string[]
  }>
  selectedOptions: string[]
}

const ANNUAL_VISITS: Record<string, number> = {
  daily: 260,
  '3x_week': 156,
  '2x_week': 104,
  weekly: 52,
  fortnightly: 26,
  once_off: 1,
}

const STATE_BY_CITY: Record<string, ContractProductState> = {
  melbourne: 'VIC',
  sydney: 'NSW',
}

const PREMISES_LABELS: Record<string, string> = {
  office: 'office',
  medical: 'medical and healthcare',
  industrial: 'industrial',
  childcare: 'childcare',
  retail: 'retail',
  gym: 'gym and fitness',
  warehouse: 'warehouse',
  function_centre: 'function centre',
  sports_facility: 'sports facility',
  other: 'commercial',
}

export function normalizeContractProductState(value: unknown): ContractProductState | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return CONTRACT_PRODUCT_STATES.includes(normalized as ContractProductState)
    ? normalized as ContractProductState
    : null
}

export function getContractProductStateForCity(city: unknown) {
  return typeof city === 'string' ? STATE_BY_CITY[city.trim().toLowerCase()] ?? null : null
}

export function getDefaultAnnualVisits(frequency: unknown) {
  return typeof frequency === 'string' ? ANNUAL_VISITS[frequency] ?? 0 : 0
}

export function calculateContractProductPricing(clientPricePerVisitExGstCents: number, annualVisits: number) {
  const safeRate = Number.isFinite(clientPricePerVisitExGstCents) ? Math.max(0, Math.round(clientPricePerVisitExGstCents)) : 0
  const safeVisits = Number.isFinite(annualVisits) ? Math.max(0, Math.round(annualVisits)) : 0
  const annualValueExGstCents = safeRate * safeVisits
  return {
    annualValueExGstCents,
    suggestedPurchasePriceExGstCents: Math.round(annualValueExGstCents * 0.5),
    gstRate: 0.1,
  }
}

export function canManageContractProducts(role: AdminRole) {
  return role === 'owner' || role === 'manager' || role === 'agent'
}

export function canActorAccessContractProduct(
  role: AdminRole,
  actorId: string,
  assignedStaffId: string | null,
) {
  return role === 'owner' || role === 'manager' || (role === 'agent' && Boolean(actorId) && actorId === assignedStaffId)
}

export function canTransitionContractProduct(from: ContractProductStatus, to: ContractProductStatus) {
  if (from === to) return true
  const transitions: Record<ContractProductStatus, ContractProductStatus[]> = {
    draft: ['available', 'withdrawn'],
    available: ['reserved', 'withdrawn'],
    reserved: ['available', 'sold', 'withdrawn'],
    sold: [],
    withdrawn: ['available'],
  }
  return transitions[from].includes(to)
}

function selectedOptions(document: FinalQuoteDocument) {
  const addOns = document.inputs.addOns
  return [
    addOns.glassCleaningRequired ? 'Glass cleaning required' : '',
    addOns.highTouchDisinfection ? 'High-touch disinfection' : '',
    addOns.carpetSteam ? 'Carpet steam cleaning required' : '',
    addOns.consumables ? 'Consumables supply included' : '',
  ].filter(Boolean)
}

export function buildCleanerScopeSnapshot(document: FinalQuoteDocument): CleanerScopeSnapshotV1 {
  const state = getContractProductStateForCity(document.inputs.city)
  const suburb = document.inputs.suburb?.trim()
  if (!state || !suburb) throw new Error('The final quote needs a supported city and suburb before a product can be created.')

  const premisesLabel = PREMISES_LABELS[document.inputs.premisesType] ?? 'commercial'
  return {
    formatVersion: 1,
    state,
    suburb,
    premisesType: document.inputs.premisesType,
    floorArea: Math.max(0, Number(document.inputs.floorArea) || 0),
    floors: Math.max(1, Math.round(Number(document.inputs.floors) || 1)),
    frequency: document.inputs.frequency,
    timePreference: document.inputs.timePreference,
    estimatedHours: Math.max(0, Number(document.result.estimatedHours) || 0),
    summary: `Recurring cleaning for a ${premisesLabel} site in ${suburb}, ${state}.`,
    rooms: document.firmQuoteDraft.roomItems.map((room) => {
      const config = getRoomTypeConfigById(document.roomTypeConfig, room.type)
      return {
        type: room.type,
        label: config?.defaultLabel ?? config?.label ?? 'Service area',
        quantity: Math.max(1, Math.round(Number(room.quantity) || 1)),
        size: Math.max(0, Number(room.size) || 0),
        floor: Math.max(1, Math.round(Number(room.floor) || 1)),
        tasks: [...(config?.scopeTasks ?? [])],
      }
    }),
    selectedOptions: selectedOptions(document),
  }
}

export function containsForbiddenCleanerScopeData(value: unknown): boolean {
  const forbiddenKeys = new Set([
    'businessname', 'contactname', 'email', 'phone', 'address', 'postcode', 'quoteref',
    'alarmnotes', 'accessnotes', 'parkingnotes', 'risknotes', 'internalnotes', 'reviewedby',
  ])
  function inspect(candidate: unknown): boolean {
    if (Array.isArray(candidate)) return candidate.some(inspect)
    if (!candidate || typeof candidate !== 'object') return false
    return Object.entries(candidate as Record<string, unknown>).some(([key, child]) => (
      forbiddenKeys.has(key.replace(/[^a-z]/gi, '').toLowerCase()) || inspect(child)
    ))
  }
  return inspect(value)
}

export function isPublishableCleanerScope(value: unknown): value is CleanerScopeSnapshotV1 {
  if (!value || typeof value !== 'object' || containsForbiddenCleanerScopeData(value)) return false
  const scope = value as Partial<CleanerScopeSnapshotV1>
  return scope.formatVersion === 1
    && Boolean(normalizeContractProductState(scope.state))
    && typeof scope.suburb === 'string' && Boolean(scope.suburb.trim())
    && typeof scope.summary === 'string' && Boolean(scope.summary.trim())
    && Array.isArray(scope.rooms) && scope.rooms.length > 0
}
