// ─── Enums / Literals ────────────────────────────────────────────────────────

export type City = 'melbourne' | 'sydney'

export type PremisesType =
  | 'office'
  | 'medical'
  | 'industrial'
  | 'childcare'
  | 'retail'
  | 'gym'
  | 'warehouse'
  | 'other'

export type CleaningFrequency =
  | 'daily'
  | '3x_week'
  | '2x_week'
  | 'weekly'
  | 'fortnightly'
  | 'once_off'

export type TimePreference = 'business_hours' | 'after_hours' | 'weekend'

export type FlooringType = 'carpet' | 'hard_floor' | 'mixed'

export type QuoteStatus = 'pending' | 'sent' | 'accepted' | 'expired' | 'declined'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

// ─── Quote Engine ─────────────────────────────────────────────────────────────

export interface QuoteAddOns {
  bathrooms: number        // count
  kitchens: number         // count
  windows: number          // count of external windows
  consumables: boolean     // +$25 flat per visit
  highTouchDisinfection: boolean  // floor area * 0.08 per visit
  carpetSteam: boolean     // flag only — quoted separately
}

export interface QuoteInputs {
  // Contact
  businessName: string
  contactName: string
  email: string
  phone: string

  // Location
  city: City
  address?: string

  // Premises
  premisesType: PremisesType
  floorArea: number          // sqm
  floors: number             // total number of floors
  flooringType: FlooringType
  meetingRooms?: number

  // Schedule
  frequency: CleaningFrequency
  timePreference: TimePreference
  isSpringClean?: boolean

  // Add-ons
  addOns: QuoteAddOns

  // Extras
  notes?: string
  heardAboutUs?: string
  preferredStartDate?: string  // ISO date string
}

export interface QuoteResult {
  baseLow: number
  baseHigh: number
  perVisitLow: number
  perVisitHigh: number
  addOnsTotal: number
  totalLow: number
  totalHigh: number
  isSpringClean: boolean
  carpetSteamSeparate: boolean
  estimatedHours: number
  breakdown: QuoteBreakdown
}

export interface QuoteBreakdown {
  baseTime: number
  baseLabour: number
  premisesMultiplier: number
  floorsMultiplier: number
  timeMultiplier: number
  frequencyMultiplier: number
  cityMultiplier: number
  addOnsDetail: AddOnsDetail
}

export interface AddOnsDetail {
  bathroomsTotal: number
  kitchensTotal: number
  windowsTotal: number
  consumablesTotal: number
  highTouchTotal: number
  carpetSteam: boolean
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface BookingInputs {
  quoteRef?: string
  businessName: string
  contactName: string
  email: string
  phone: string
  address: string
  city: City
  premisesType: PremisesType
  floorArea: number
  frequency: CleaningFrequency
  timePreference: TimePreference
  preferredStartDate: string  // ISO date string
  addOns: QuoteAddOns
  notes?: string
  agreedPrice?: number        // per-visit agreed price
}

// ─── Database Models ──────────────────────────────────────────────────────────

export interface Client {
  id: string
  businessName: string
  contactName: string
  email: string
  phone: string
  address?: string
  city: City
  createdAt: string
  updatedAt: string
}

export interface Quote {
  id: string
  quoteRef: string
  clientId?: string
  inputs: QuoteInputs
  result: QuoteResult
  status: QuoteStatus
  validUntil: string
  createdAt: string
  updatedAt: string
}

export interface Booking {
  id: string
  bookingRef: string
  quoteId?: string
  clientId: string
  inputs: BookingInputs
  status: BookingStatus
  assignedInspectorId?: string
  assignedOperatorId?: string
  firstCleanDate?: string
  recurringSchedule?: RecurringSchedule
  createdAt: string
  updatedAt: string
}

export interface RecurringSchedule {
  frequency: CleaningFrequency
  dayOfWeek?: number[]  // 0=Sun, 1=Mon, etc.
  timeStart: string     // HH:MM
  timeEnd?: string
}

export interface Inspector {
  id: string
  name: string
  email: string
  phone: string
  city: City
  calendarConnected: boolean
  googleCalendarId?: string
  isActive: boolean
  createdAt: string
}

export interface AvailabilityBlock {
  id: string
  inspectorId: string
  startAt: string   // ISO datetime
  endAt: string     // ISO datetime
  reason?: string
}

export interface Lead {
  id: string
  email: string
  businessName?: string
  contactName?: string
  phone?: string
  city?: City
  source?: string
  notes?: string
  convertedToClientId?: string
  createdAt: string
}

export interface OwnerOperator {
  id: string
  businessName: string
  operatorName: string
  email: string
  phone: string
  city: City
  areasServiced: string[]
  premisesTypes: PremisesType[]
  isVerified: boolean
  isActive: boolean
  siteInducted: boolean
  insuranceExpiry?: string
  rating?: number
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export interface ContractSale {
  id: string
  bookingId: string
  operatorId: string
  salePrice: number
  commissionRate: number
  commissionAmount: number
  status: 'pending' | 'paid' | 'disputed'
  paidAt?: string
  createdAt: string
}

export interface OwnerOperatorRating {
  id: string
  operatorId: string
  bookingId: string
  clientId: string
  rating: number      // 1–5
  review?: string
  isPublic: boolean
  createdAt: string
}

export interface AiChatSession {
  id: string
  sessionToken: string
  messages: ChatMessage[]
  clientEmail?: string
  leadId?: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
