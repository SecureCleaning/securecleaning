import type { AgentCleanerEmailHistory, CleanerEmail } from '@/lib/cleaners'

export type AustralianAgentState = 'NSW' | 'VIC'

export function getStateForAvailabilityCity(city: string): AustralianAgentState | null {
  switch (city) {
    case 'melbourne': return 'VIC'
    case 'sydney': return 'NSW'
    default: return null
  }
}

export function getAgentCleanerPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}

export function toAgentCleanerEmailHistory(email: CleanerEmail): AgentCleanerEmailHistory {
  return {
    id: email.id,
    subject: email.subject,
    status: email.status,
    template_name: email.template_name,
    created_at: email.created_at,
    sent_at: email.sent_at,
  }
}
