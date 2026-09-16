import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import { EmailProviderRejectedError } from '@/lib/email'

// Limits work per HTTP request, not recipients per campaign.
export const EMAIL_DELIVERY_STEP_SIZE = 10
export const EMAIL_DELIVERY_STEP_MS = 12_000
export const EMAIL_QUERY_PAGE_SIZE = 250

export async function readEmailPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += EMAIL_QUERY_PAGE_SIZE) {
    const result = await page(from, from + EMAIL_QUERY_PAGE_SIZE - 1)
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < EMAIL_QUERY_PAGE_SIZE) return rows
  }
}

export async function acquireEmailDeliverySlot() {
  const { data, error } = await getAdminSupabase().rpc('acquire_cleaner_email_slot')
  if (error) throw new Error('Email pacing is unavailable. No message was sent.')
  return data === true
}

export function emailProviderPause(error: unknown): 'rate' | 'quota' | null {
  if (!(error instanceof EmailProviderRejectedError)) return null
  if (error.providerErrorName === 'rate_limit_exceeded') return 'rate'
  if (['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(error.providerErrorName || '')) return 'quota'
  return null
}
