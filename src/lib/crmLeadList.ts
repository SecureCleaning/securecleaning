import type { CrmOpportunity } from './clientCrmData'

export const CRM_LEAD_SORTS = {
  updated: 'Recently updated',
  created: 'Newest added',
  name: 'Business A-Z',
  stage: 'Stage',
  followUp: 'Next follow-up',
} as const
export type CrmLeadSort = keyof typeof CRM_LEAD_SORTS
export function parseCrmLeadSort(value: string | null): CrmLeadSort {
  return value && Object.hasOwn(CRM_LEAD_SORTS, value) ? value as CrmLeadSort : 'updated'
}
export function crmLeadSortKey(actorId: string) { return `sc-crm-lead-sort:${actorId}` }
const stages = ['new', 'contacted', 'qualified', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost', 'cancelled']
const date = (value: string | null | undefined, missing = 0) => {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : missing
}
export const CRM_LEAD_STAGE_FILTERS = ['new', 'contacted', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost'] as const
export type CrmLeadStageFilter = 'all' | typeof CRM_LEAD_STAGE_FILTERS[number]
export function parseCrmLeadStageFilter(value: string | null): CrmLeadStageFilter {
  return CRM_LEAD_STAGE_FILTERS.some(stage => stage === value) ? value as CrmLeadStageFilter : 'all'
}
export function crmLeadStageFilterKey(actorId: string) { return `sc-crm-lead-stage:${actorId}` }

export function filterSortCrmLeads(leads: CrmOpportunity[], search: string, sort: CrmLeadSort, stage: CrmLeadStageFilter = 'all') {
  const query = search.trim().toLowerCase()
  return leads.filter(lead => stage === 'all' || lead.stage === stage || (stage === 'contacted' && lead.stage === 'qualified') || (stage === 'lost' && lead.stage === 'cancelled'))
    .filter(lead => !query || [lead.businessName, lead.contactName, lead.email, lead.suburb, lead.postcode, lead.sourceProvider, lead.assignedStaffName].some(value => value?.toLowerCase().includes(query)))
    .sort((a,b) => {
      let order = 0
      if (sort === 'name') order = (a.businessName || a.contactName || a.email).localeCompare(b.businessName || b.contactName || b.email, 'en', { sensitivity: 'base' })
      else if (sort === 'stage') order = stages.indexOf(a.stage) - stages.indexOf(b.stage)
      else if (sort === 'followUp') order = date(a.nextFollowUpAt, Infinity) - date(b.nextFollowUpAt, Infinity)
      else order = date(sort === 'created' ? b.createdAt : b.updatedAt) - date(sort === 'created' ? a.createdAt : a.updatedAt)
      return (Number.isNaN(order) ? 0 : order) || a.id.localeCompare(b.id)
    })
}
