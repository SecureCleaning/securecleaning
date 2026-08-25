import type { AdminRole, StaffAccount } from '@/lib/staffAccounts'

export const CRM_ROLES = ['owner', 'manager', 'agent'] as const
export const CRM_OPPORTUNITY_STAGES = ['new', 'contacted', 'qualified', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost', 'cancelled'] as const
export const CRM_CONTACT_BASES = ['enquiry', 'purchased_lead', 'existing_relationship', 'inferred_business_interest'] as const
export const CRM_SOURCE_TYPES = ['manual', 'online_quote', 'purchased_lead', 'cold_outreach', 'direct_booking'] as const

export type CrmRole = (typeof CRM_ROLES)[number]
export type CrmOpportunityStage = (typeof CRM_OPPORTUNITY_STAGES)[number]
export type CrmContactBasis = (typeof CRM_CONTACT_BASES)[number]
export type CrmSourceType = (typeof CRM_SOURCE_TYPES)[number]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function canAccessClientCrm(role: AdminRole): role is CrmRole {
  return CRM_ROLES.includes(role as CrmRole)
}
export function canManageSharedCrmTemplates(role: AdminRole) {
  return role === 'owner' || role === 'manager'
}

export function hasCompleteCrmSignature(account: Pick<StaffAccount, 'displayName' | 'email' | 'phone' | 'jobTitle'>) {
  return Boolean(
    account.displayName.trim()
    && EMAIL_PATTERN.test(account.email.trim())
    && account.phone.trim()
    && account.jobTitle.trim(),
  )
}

export function getMissingCrmSignatureFields(account: Pick<StaffAccount, 'displayName' | 'email' | 'phone' | 'jobTitle'>) {
  const missing: string[] = []
  if (!account.displayName.trim()) missing.push('display name')
  if (!EMAIL_PATTERN.test(account.email.trim())) missing.push('valid work email')
  if (!account.phone.trim()) missing.push('work phone')
  if (!account.jobTitle.trim()) missing.push('position title')
  return missing
}

export function normalizeCrmEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 320) : ''
}

export function isValidCrmEmail(value: string) {
  return EMAIL_PATTERN.test(value)
}

export function normalizeCrmPostcode(value: unknown) {
  const postcode = typeof value === 'string' ? value.trim() : ''
  return /^\d{4}$/.test(postcode) ? postcode : ''
}

export function normalizeCrmStage(value: unknown): CrmOpportunityStage | null {
  return typeof value === 'string' && CRM_OPPORTUNITY_STAGES.includes(value as CrmOpportunityStage)
    ? value as CrmOpportunityStage
    : null
}

export function normalizeCrmContactBasis(value: unknown): CrmContactBasis | null {
  return typeof value === 'string' && CRM_CONTACT_BASES.includes(value as CrmContactBasis)
    ? value as CrmContactBasis
    : null
}

export function normalizeCrmSourceType(value: unknown): CrmSourceType | null {
  return typeof value === 'string' && CRM_SOURCE_TYPES.includes(value as CrmSourceType)
    ? value as CrmSourceType
    : null
}

export function requiresNamedSourceProvider(sourceType: CrmSourceType, contactBasis: CrmContactBasis) {
  return sourceType === 'purchased_lead' || contactBasis === 'purchased_lead' || sourceType === 'cold_outreach'
}

export function buildContactSourceExplanation(input: {
  sourceType: CrmSourceType
  sourceProvider?: string | null
  customExplanation?: string | null
}) {
  const custom = input.customExplanation?.trim()
  if (custom) return custom.slice(0, 500)

  const provider = input.sourceProvider?.trim()
  if (input.sourceType === 'online_quote') return 'you requested information or a quote through the Secure Cleaning Aus website'
  if (input.sourceType === 'direct_booking') return 'you requested a site inspection through the Secure Cleaning Aus website'
  if (input.sourceType === 'purchased_lead' && provider) return `we received your contact information from ${provider} in relation to commercial cleaning services`
  if (input.sourceType === 'cold_outreach' && provider) return `your business contact details were publicly listed by ${provider}`
  if (provider) return `we received your contact information from ${provider}`
  return 'your details were provided to Secure Cleaning Aus in relation to commercial cleaning services'
}

export function applyCrmTemplateTokens(value: string, tokens: Record<string, string>) {
  return Object.entries(tokens).reduce(
    (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement),
    value,
  )
}

export function canActorAccessAssignedOpportunity(role: AdminRole, actorId: string, assignedStaffId: string | null) {
  if (role === 'owner' || role === 'manager') return true
  return role === 'agent' && Boolean(actorId && assignedStaffId === actorId)
}
