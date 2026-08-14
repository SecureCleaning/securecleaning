export const bookingStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

export type BookingStatusValue = (typeof bookingStatuses)[number]

export function isBookingStatus(value: unknown): value is BookingStatusValue {
  return typeof value === 'string' && bookingStatuses.includes(value as BookingStatusValue)
}
