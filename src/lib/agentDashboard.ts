import 'server-only'

import { getAgentCalendarEvents, type AgentCalendarEvent } from '@/lib/availabilityCalendar'
import { getCityTimeZone } from '@/lib/calendarInvite'
import { getCrmAssignedQuoteOpportunities, quoteMatchesAgentServiceRegion } from '@/lib/clientCrmQuoteAccess'
import { getContractProducts } from '@/lib/contractProducts'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import type { AvailabilityAssignee, AvailabilityConfig } from '@/lib/availability'
import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs } from '@/lib/types'
import { buildDashboardWeek, quoteRequiresFollowUp, saleRequiresInduction } from '@/lib/agentDashboardPolicy'

export type AgentDashboardFollowUpQuote = {
  quoteRef: string
  businessName: string
  contactName: string
  suburb: string
  postcode: string
  createdAt: string
  validUntil: string | null
}

export type AgentDashboardData = {
  pendingQuoteCount: number
  sentFollowUpCount: number
  sentFollowUps: AgentDashboardFollowUpQuote[]
  productsForSaleCount: number
  inductionsRequiredCount: number
  week: Array<{
    key: string
    label: string
    dateLabel: string
    isToday: boolean
    events: AgentCalendarEvent[]
  }>
  timeZone: string
  weekOffset: number
}

type QuoteRow = {
  id: string
  quote_ref: string
  status: string
  follow_up_status?: string | null
  created_at: string
  valid_until?: string | null
  inputs?: QuoteInputs
}

export async function getAgentDashboardData(
  actor: ContractProductActor,
  config: AvailabilityConfig,
  assignee: AvailabilityAssignee,
  weekOffset = 0,
): Promise<AgentDashboardData> {
  const timeZone = getCityTimeZone(assignee.city)
  const now = new Date()
  const week = buildDashboardWeek([], now, timeZone, weekOffset)
  const anchorDate = new Date(`${week[0].key}T12:00:00Z`)
  const db = getAdminSupabase()
  const [calendarEvents, products, quotesResult] = await Promise.all([
    getAgentCalendarEvents(config, assignee, { daysBehind: 0, daysAhead: 6, includeAvailability: true, anchorDate }),
    getContractProducts(actor),
    db.from('quotes')
      .select('id, quote_ref, status, follow_up_status, created_at, valid_until, inputs')
      .in('status', ['pending', 'sent'])
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  if (quotesResult.error) throw quotesResult.error
  const quoteRows = (quotesResult.data ?? []) as QuoteRow[]
  const crmAssignments = await getCrmAssignedQuoteOpportunities(assignee.id, quoteRows.map((quote) => quote.id))
  const assignedQuotes = quoteRows.filter((quote) => (
    quote.inputs
    && (quoteMatchesAgentServiceRegion(config, assignee.id, quote.inputs) || crmAssignments.has(quote.id))
  ))
  const sentFollowUps = assignedQuotes
    .filter((quote) => quoteRequiresFollowUp({ status: quote.status, followUpStatus: quote.follow_up_status }))
    .sort((left, right) => (left.valid_until ?? left.created_at).localeCompare(right.valid_until ?? right.created_at))

  const accessibleProductIds = products.map((product) => product.id)
  let inductionRows: Array<{ status: string }> = []
  if (accessibleProductIds.length > 0) {
    const { data, error } = await db.from('contract_product_sales')
      .select('status')
      .eq('assigned_staff_id', actor.id)
      .in('product_id', accessibleProductIds)
      .in('status', ['inspection_ready', 'inspection_scheduled'])
      .limit(200)
    if (error) throw error
    inductionRows = (data ?? []) as Array<{ status: string }>
  }

  return {
    pendingQuoteCount: assignedQuotes.filter((quote) => quote.status === 'pending').length,
    sentFollowUpCount: sentFollowUps.length,
    sentFollowUps: sentFollowUps.slice(0, 8).map((quote) => ({
      quoteRef: quote.quote_ref,
      businessName: quote.inputs?.businessName ?? '',
      contactName: quote.inputs?.contactName ?? '',
      suburb: quote.inputs?.suburb ?? '',
      postcode: quote.inputs?.postcode ?? '',
      createdAt: quote.created_at,
      validUntil: quote.valid_until ?? null,
    })),
    productsForSaleCount: products.filter((product) => product.status === 'available').length,
    inductionsRequiredCount: inductionRows.filter((sale) => saleRequiresInduction(sale.status)).length,
    week: buildDashboardWeek(calendarEvents, now, timeZone, weekOffset),
    timeZone,
    weekOffset,
  }
}
