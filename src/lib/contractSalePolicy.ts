import type { AdminRole } from '@/lib/staffAccounts'

export const CONTRACT_SALE_STATUSES = [
  'draft', 'deposit_due', 'inspection_ready', 'inspection_scheduled', 'agreement_pending',
  'balance_due', 'active_payment_plan', 'ready_for_handover', 'completed', 'cancelled',
] as const

export type ContractSaleStatus = (typeof CONTRACT_SALE_STATUSES)[number]
export type ContractSaleInvoiceType = 'sale' | 'deposit' | 'balance'
export type ContractSaleInvoiceStatus = 'issued' | 'part_paid' | 'paid' | 'overdue' | 'void'
export type ContractSalePaymentStatus = 'pending' | 'confirmed' | 'rejected'

export const CONTRACT_SALE_DEPOSIT_INC_GST_CENTS = 50_000

export function calculateInclusiveGstComponent(totalIncGstCents: number) {
  const total = Math.max(0, Math.round(totalIncGstCents))
  return total - Math.round(total / 1.1)
}

export function calculateContractSaleBalance(totalIncGstCents: number, confirmedDepositCents: number) {
  return Math.max(0, Math.round(totalIncGstCents) - Math.max(0, Math.round(confirmedDepositCents)))
}

export function canManageContractSale(role: AdminRole, actorId: string, assignedStaffId: string | null) {
  return role === 'owner' || role === 'manager' || (role === 'agent' && Boolean(actorId) && actorId === assignedStaffId)
}

export function canApproveContractSalePaymentPlan(role: AdminRole) {
  return role === 'owner' || role === 'manager' || role === 'agent'
}

export function canConfirmContractSalePayment(role: AdminRole) {
  return role === 'owner' || role === 'manager'
}

export function buildMonthlyInstalments(input: {
  balanceCents: number
  count: number
  firstDueOn: string
}) {
  const count = Math.round(input.count)
  if (!Number.isInteger(count) || count < 2 || count > 24) throw new Error('Choose between 2 and 24 monthly instalments.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueOn)) throw new Error('Enter the first instalment date.')
  const balance = Math.round(input.balanceCents)
  if (balance < count) throw new Error('The balance is too small for that instalment count.')
  const base = Math.floor(balance / count)
  let remainder = balance - base * count
  const [year, month, day] = input.firstDueOn.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const targetMonth = month - 1 + index
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
    const due = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)))
    const amountCents = base + (remainder > 0 ? 1 : 0)
    remainder -= remainder > 0 ? 1 : 0
    return {
      sequenceNumber: index + 1,
      dueOn: due.toISOString().slice(0, 10),
      amountCents,
    }
  })
}

export function buildPaymentPlanTerms(input: {
  saleCode: string
  cleanerBusiness: string
  balanceCents: number
  instalments: Array<{ sequenceNumber: number; dueOn: string; amountCents: number }>
}) {
  const money = (cents: number) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2,
  }).format(cents / 100)
  const schedule = input.instalments.map((item) => (
    `${item.sequenceNumber}. ${money(item.amountCents)} due ${item.dueOn}`
  )).join('\n')
  return [
    `Payment plan for ${input.saleCode}`,
    `Cleaner: ${input.cleanerBusiness}`,
    `Balance covered by this plan: ${money(input.balanceCents)} including GST.`,
    '',
    schedule,
    '',
    'Secure Cleaning retains the contractual sale and assignment rights until every amount under this plan is paid in cleared funds.',
    'The cleaner may commence servicing the client only after Secure Cleaning records the operational handover.',
    'Failure to pay an instalment by its due date may suspend the handover or servicing rights and may cause the remaining balance to become immediately payable, subject to the signed agreement.',
  ].join('\n')
}

export function buildContractSaleAgreement(input: {
  saleCode: string
  productCode: string
  cleanerName: string
  cleanerBusiness: string
  suburb: string
  state: string
  purchasePriceIncGstCents: number
  depositIncGstCents: number
  paymentPlanTerms?: string
}) {
  const money = (cents: number) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2,
  }).format(cents / 100)
  return [
    'SECURE CLEANING CONTRACT SALE AGREEMENT',
    '',
    `Sale: ${input.saleCode}`,
    `Product: ${input.productCode}`,
    `Cleaner: ${input.cleanerName} — ${input.cleanerBusiness}`,
    `Service area: ${input.suburb}, ${input.state}`,
    `Purchase price: ${money(input.purchasePriceIncGstCents)} including GST`,
    `Deposit: ${money(input.depositIncGstCents)} including GST, due on receipt and before the site inspection.`,
    '',
    'The cleaner will invoice the client directly after the operational handover. The cleaner must not commence cleaning until Secure Cleaning records that handover.',
    'Secure Cleaning retains the contractual sale and assignment rights until the purchase price is paid in full. Where an approved payment plan applies, commencement is permitted only under the signed payment-plan terms.',
    'Client identity, access, security and operational information must be kept confidential and used only to provide the contracted cleaning service.',
    input.paymentPlanTerms ? `\nPAYMENT PLAN\n${input.paymentPlanTerms}` : '',
    '',
    'This system-generated draft must be reviewed before signature. The uploaded signed PDF is the authoritative agreement record.',
  ].filter(Boolean).join('\n')
}

export function normalizeInvoiceEmail(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 320) : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}
