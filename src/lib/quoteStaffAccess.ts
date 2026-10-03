import 'server-only'
import { cookies } from 'next/headers'
import { getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'
import { AVAILABILITY_AGENT_SESSION_COOKIE, hasAvailabilityAgentSession } from '@/lib/availabilityAgentAuth'
import { getAvailabilityConfig } from '@/lib/availability'
import { canAvailabilityAgentAccessQuote } from '@/lib/clientCrmQuoteAccess'

export async function canStaffAccessQuote(quoteRef: string, share = false) {
  try {
    const identity = await getAdminSessionIdentityFromCookies()
    if (identity && identity.role !== 'agent') return !share || identity.role !== 'viewer'
    let assigneeId: string | null = null
    if (identity?.role === 'agent') assigneeId = (await getStaffAccountById(identity.id))?.availability_assignee_id ?? null
    else {
      const raw = (await cookies()).get(AVAILABILITY_AGENT_SESSION_COOKIE)?.value
      if (raw) {
        const parsed = JSON.parse(Buffer.from(raw.split('.')[0], 'base64url').toString('utf8'))
        if (typeof parsed.a === 'string') assigneeId = parsed.a
      }
    }
    if (!assigneeId || !await hasAvailabilityAgentSession(assigneeId)) return false
    const { getQuoteWorkflowByRef } = await import('@/lib/quoteWorkflowData')
    const quote = await getQuoteWorkflowByRef(quoteRef)
    return Boolean(quote && await canAvailabilityAgentAccessQuote(await getAvailabilityConfig(), assigneeId, quote))
  } catch { return false }
}
