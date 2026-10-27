import type { CleaningFrequency, TimePreference } from '@/lib/types'

export const CRM_CLEANING_FREQUENCIES: CleaningFrequency[] = ['daily', '7x_week', '3x_week', '2x_week', 'weekly', 'fortnightly', 'monthly']
export const CRM_TIME_PREFERENCES: TimePreference[] = ['business_hours', 'after_hours', 'weekend']

export function crmCleaningFrequency(value: unknown): CleaningFrequency | null {
  return CRM_CLEANING_FREQUENCIES.includes(value as CleaningFrequency) ? value as CleaningFrequency : null
}

export function crmCleaningTime(value: unknown): TimePreference | null {
  return CRM_TIME_PREFERENCES.includes(value as TimePreference) ? value as TimePreference : null
}

export function resolveCrmCleaningPreferences(saved: { frequency?: unknown; timePreference?: unknown } = {}, fallback: { frequency?: unknown; timePreference?: unknown } = {}) {
  return {
    frequency: crmCleaningFrequency(saved.frequency) ?? crmCleaningFrequency(fallback.frequency) ?? '',
    timePreference: crmCleaningTime(saved.timePreference) ?? crmCleaningTime(fallback.timePreference) ?? 'after_hours',
  } as { frequency: CleaningFrequency | ''; timePreference: TimePreference }
}
