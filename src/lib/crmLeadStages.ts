// Stored stage codes stay compatible with existing opportunity history.
export const CRM_LEAD_STAGES = {
  new: { label: 'Not contacted', colour: 'border-orange-200 bg-orange-50' },
  contacted: { label: 'Contacted', colour: 'border-lime-200 bg-lime-50' },
  qualified: { label: 'Contacted', colour: 'border-lime-200 bg-lime-50' },
  inspection: { label: 'Inspection booked', colour: 'border-sky-200 bg-sky-50' },
  quoting: { label: 'Quote in progress', colour: 'border-purple-200 bg-purple-50' },
  proposal_sent: { label: 'Quote sent', colour: 'border-yellow-200 bg-yellow-50' },
  won: { label: 'Won', colour: 'border-green-400 bg-green-100' },
  lost: { label: 'Lost / Not proceeding', colour: 'border-gray-200 bg-gray-100' },
  cancelled: { label: 'Not proceeding', colour: 'border-gray-200 bg-gray-100' },
} as const

export function crmLeadStage(stage: string) {
  return CRM_LEAD_STAGES[stage as keyof typeof CRM_LEAD_STAGES] ?? CRM_LEAD_STAGES.new
}

export function isCrmLeadOverdue(stage: string, followUpAt: string | null, now = Date.now()) {
  return !['won', 'lost', 'cancelled'].includes(stage) && Boolean(followUpAt) && Date.parse(followUpAt!) < now
}
