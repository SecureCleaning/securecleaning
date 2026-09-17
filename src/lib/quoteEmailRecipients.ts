import 'server-only'

import {
  getAssigneeServiceZones,
  getAvailabilityAssignee,
  getAvailabilityConfig,
  locationMatchesServiceZones,
} from '@/lib/availability'
import { getCrmOpportunityIdForQuote } from '@/lib/clientCrmQuoteAccess'
import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs } from '@/lib/types'

export class QuoteAgentEmailError extends Error {}

function validEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : null
}

function agentCc(emails: Array<string | null>, recipient: string): string[] {
  if (emails.length === 0 || emails.some((email) => !email)) {
    throw new QuoteAgentEmailError('Assign an active agent with a valid email address before sending this quote.')
  }
  return [...new Set(emails as string[])].filter((email) => email !== recipient.trim().toLowerCase())
}

/** CRM ownership takes precedence over the latest inspection booking, then a unique service-zone agent.
 * QuoteInputs has no agent assignment field; never trust extra assignee/CC fields in quote submissions.
 */
export async function getQuoteAgentCc(quoteRef: string, inputs: QuoteInputs, recipient = inputs.email): Promise<string[]> {
  try {
    const db = getAdminSupabase()
    const { data: quote, error: quoteError } = await db.from('quotes')
      .select('id').eq('quote_ref', quoteRef).maybeSingle()
    if (quoteError) throw quoteError

    if (quote) {
      const opportunityId = await getCrmOpportunityIdForQuote(quote.id)
      if (opportunityId) {
        const { data: opportunity, error } = await db.from('crm_opportunities')
          .select('assigned_staff_id').eq('id', opportunityId).maybeSingle()
        if (error) throw error
        if (opportunity?.assigned_staff_id) {
          const { data: staff, error: staffError } = await db.from('admin_staff_accounts')
            .select('email, active, role, availability_assignee_id').eq('id', opportunity.assigned_staff_id).maybeSingle()
          if (staffError) throw staffError
          if (!staff?.active || staff.role !== 'agent') return agentCc([], recipient)
          const email = validEmail(staff.email)
          if (email) return agentCc([email], recipient)
          const config = await getAvailabilityConfig()
          const assignee = getAvailabilityAssignee(config, staff.availability_assignee_id ?? '')
          return agentCc([assignee?.active ? validEmail(assignee.email) : null], recipient)
        }
      }

      const { data: booking, error: bookingError } = await db.from('bookings')
        .select('inputs').eq('quote_id', quote.id).neq('status', 'cancelled')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (bookingError) throw bookingError
      const assigneeId = booking?.inputs?.preferredInspectionAssigneeId
      if (typeof assigneeId === 'string' && assigneeId) {
        const config = await getAvailabilityConfig()
        const assignee = getAvailabilityAssignee(config, assigneeId)
        return agentCc([assignee?.active ? validEmail(assignee.email) : null], recipient)
      }
    }

    const config = await getAvailabilityConfig()
    const agents = config.assignees.filter((assignee) => (
      assignee.active && assignee.city === inputs.city &&
      locationMatchesServiceZones(inputs, inputs.city, getAssigneeServiceZones(config, assignee.id))
    ))
    if (agents.length > 1) {
      throw new QuoteAgentEmailError('More than one agent covers this quote. Assign the responsible agent in CRM before sending.')
    }
    return agentCc(agents.map((assignee) => validEmail(assignee.email)), recipient)
  } catch (error) {
    if (error instanceof QuoteAgentEmailError) throw error
    throw new QuoteAgentEmailError('Could not confirm the quote agent email. Please retry before sending this quote.')
  }
}
