import 'server-only'

import {
  getAssigneeServiceZones,
  getAvailabilityAssignee,
  locationMatchesServiceZones,
  type AvailabilityConfig,
} from '@/lib/availability'
import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs } from '@/lib/types'

type QuoteForAgentAccess = {
  id: string
  inputs: QuoteInputs
}

export type CrmAssignedQuoteOpportunityContext = {
  id: string
  stage: string
  updatedAt: string
  productId: string | null
  productStatus: string | null
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function quoteMatchesAgentServiceRegion(
  config: AvailabilityConfig,
  assigneeId: string,
  inputs: QuoteInputs,
) {
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee || inputs.city !== assignee.city) return false
  const serviceZones = getAssigneeServiceZones(config, assigneeId)
  return serviceZones.length === 0 || locationMatchesServiceZones(inputs, inputs.city, serviceZones)
}

export async function getCrmAssignedQuoteOpportunities(
  assigneeId: string,
  quoteIds: string[],
) {
  const assignments = new Map<string, string>()
  const ids = unique(quoteIds)
  if (!assigneeId || ids.length === 0) return assignments

  const db = getAdminSupabase()
  const { data: staffRows, error: staffError } = await db
    .from('admin_staff_accounts')
    .select('id')
    .eq('availability_assignee_id', assigneeId)
    .eq('role', 'agent')
    .eq('active', true)
  if (staffError) throw staffError

  const staffIds = unique((staffRows ?? []).map((row) => String(row.id)))
  if (staffIds.length === 0) return assignments

  const { data: opportunityRows, error: opportunityError } = await db
    .from('crm_opportunities')
    .select('id')
    .in('assigned_staff_id', staffIds)
  if (opportunityError) throw opportunityError

  const opportunityIds = unique((opportunityRows ?? []).map((row) => String(row.id)))
  if (opportunityIds.length === 0) return assignments

  const { data: linkRows, error: linkError } = await db
    .from('crm_opportunity_quotes')
    .select('quote_id, opportunity_id')
    .in('opportunity_id', opportunityIds)
    .in('quote_id', ids)
  if (linkError) throw linkError

  for (const row of linkRows ?? []) {
    assignments.set(String(row.quote_id), String(row.opportunity_id))
  }
  return assignments
}

export async function getCrmOpportunityIdForQuote(quoteId: string) {
  if (!quoteId) return null
  const { data, error } = await getAdminSupabase()
    .from('crm_opportunity_quotes')
    .select('opportunity_id')
    .eq('quote_id', quoteId)
    .maybeSingle()
  if (error) throw error
  return data?.opportunity_id ? String(data.opportunity_id) : null
}

export async function getCrmAssignedQuoteOpportunityContext(
  assigneeId: string,
  quoteId: string,
): Promise<CrmAssignedQuoteOpportunityContext | null> {
  const assignments = await getCrmAssignedQuoteOpportunities(assigneeId, [quoteId])
  const opportunityId = assignments.get(quoteId)
  if (!opportunityId) return null

  const db = getAdminSupabase()
  const [{ data: opportunity, error: opportunityError }, { data: product, error: productError }] = await Promise.all([
    db.from('crm_opportunities')
      .select('id, stage, updated_at')
      .eq('id', opportunityId)
      .maybeSingle(),
    db.from('contract_products')
      .select('id, status')
      .eq('opportunity_id', opportunityId)
      .maybeSingle(),
  ])
  if (opportunityError) throw opportunityError
  if (productError) throw productError
  if (!opportunity) return null

  return {
    id: String(opportunity.id),
    stage: String(opportunity.stage),
    updatedAt: String(opportunity.updated_at),
    productId: product?.id ? String(product.id) : null,
    productStatus: product?.status ? String(product.status) : null,
  }
}

export async function canAvailabilityAgentAccessQuote(
  config: AvailabilityConfig,
  assigneeId: string,
  quote: QuoteForAgentAccess,
) {
  if (quoteMatchesAgentServiceRegion(config, assigneeId, quote.inputs)) return true
  const assignments = await getCrmAssignedQuoteOpportunities(assigneeId, [quote.id])
  return assignments.has(quote.id)
}
