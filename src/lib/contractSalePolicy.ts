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
  cleanerAbn?: string
  cleanerAddress?: string
  suburb: string
  state: string
  purchasePriceIncGstCents: number
  depositIncGstCents: number
  paymentPlanTerms?: string
}) {
  const money = (cents: number) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2,
  }).format(cents / 100)
  const balance = Math.max(0, input.purchasePriceIncGstCents - input.depositIncGstCents)
  const purchaserDetails = [
    `Purchaser business: ${input.cleanerBusiness}`,
    `Authorised representative: ${input.cleanerName}`,
    input.cleanerAbn ? `Purchaser ABN: ${input.cleanerAbn}` : 'Purchaser ABN: To be completed before signing',
    input.cleanerAddress ? `Purchaser address: ${input.cleanerAddress}` : 'Purchaser address: To be completed before signing',
  ]
  const governingLaw = input.state ? `${input.state}, Australia` : 'the Australian state or territory in which the Site is located'
  return [
    'SECURE CLEANING — CLEANING CONTRACT PURCHASE AGREEMENT',
    'DRAFT FOR REVIEW AND SIGNATURE',
    '',
    'PARTIES',
    'Seller: Secure Cleaning (ABN 81 674 121 825)',
    'Seller email: info@securecleaning.com.au',
    ...purchaserDetails,
    '',
    'SCHEDULE 1 — SALE PARTICULARS',
    `Product sale reference: ${input.saleCode}`,
    `Contract product reference: ${input.productCode}`,
    `General service location: ${input.suburb}, ${input.state}`,
    `Total purchase price: ${money(input.purchasePriceIncGstCents)} including GST`,
    `Deposit payable now: ${money(input.depositIncGstCents)} including GST`,
    `Balance after deposit: ${money(balance)} including GST`,
    'Proposed commencement date: As recorded in the product sale record or otherwise agreed in writing.',
    '',
    '1. PURPOSE AND TRANSACTION',
    '1.1 Secure Cleaning has arranged or holds the benefit of the customer cleaning opportunity identified by the references in Schedule 1 (Contract). The Purchaser wishes to acquire the right to service that Contract, subject to this Agreement and completion of the operational handover.',
    '1.2 The Contract concerns the cleaning site described generally in Schedule 1 (Site). The client name, full Site address, access information and other restricted details may be released only when the deposit has cleared and disclosure is reasonably required for the site inspection.',
    '1.3 The scope of work, final client quote and any written variation accepted by the client form the service information for this sale. If those records conflict with promotional or summary material, the accepted client records prevail.',
    '',
    '2. INFORMATION, DUE DILIGENCE AND NO REVENUE GUARANTEE',
    '2.1 Secure Cleaning will provide information reasonably available about the Contract so the Purchaser can assess it. The Purchaser must make its own commercial, staffing, travel, equipment, tax and profitability assessment before completing the purchase.',
    '2.2 Any annual value, hours, frequency or expected income is an estimate based on the information available when prepared. Secure Cleaning does not guarantee the duration, renewal, profitability or future revenue of the client relationship.',
    '2.3 The Purchaser must promptly identify any material difference between the Site inspection and the supplied scope of work.',
    '',
    '3. DEPOSIT AND SITE INSPECTION',
    `3.1 Secure Cleaning will issue one tax invoice for the full purchase price. Only the deposit of ${money(input.depositIncGstCents)} including GST is due on receipt and must clear before the site inspection.`,
    '3.2 The deposit reserves the Contract while Secure Cleaning arranges a three-party inspection with the client, the Purchaser and a Secure Cleaning representative.',
    '3.3 If Secure Cleaning cannot arrange the inspection, or if the Site is materially inconsistent with the supplied scope and the parties cannot agree a reasonable correction, Secure Cleaning will refund the deposit. The deposit is otherwise applied to the purchase price.',
    '3.4 The Purchaser must not contact, solicit, quote, perform work for or enter the Site except through the inspection and handover process authorised by Secure Cleaning.',
    '',
    '4. BALANCE, PAYMENT PLAN AND RETAINED RIGHTS',
    `4.1 The balance of ${money(balance)} including GST must be paid in cleared funds before cleaning commences, unless Secure Cleaning has approved a written payment plan.`,
    '4.2 Until the full purchase price and every other amount due under an approved payment plan have been paid in cleared funds, Secure Cleaning retains the benefit of, and all sale and assignment rights in, the Contract. The Purchaser receives no ownership or assignment merely by paying the deposit, inspecting the Site or beginning preparations.',
    '4.3 If an approved payment plan permits commencement before full payment, the Purchaser receives only a conditional, revocable right to service the Site in accordance with that plan and this Agreement. The Purchaser must not sell, assign, charge or otherwise deal with the Contract before payment in full.',
    '4.4 Payment evidence recorded by an agent is not confirmation of cleared funds. Secure Cleaning will separately confirm cleared payments in its ledger.',
    input.paymentPlanTerms ? `\nSCHEDULE 2 — APPROVED PAYMENT PLAN\n${input.paymentPlanTerms}` : '',
    '',
    '5. OPERATIONAL HANDOVER AND CLIENT BILLING',
    '5.1 The Purchaser must not commence cleaning or invoice the client until Secure Cleaning records the operational handover.',
    '5.2 After handover, the Purchaser invoices the client directly and is responsible for its own GST, tax, payroll, superannuation and business obligations.',
    '5.3 The Purchaser acts as an independent business. Nothing in this Agreement creates employment, partnership, agency or authority to bind Secure Cleaning.',
    '',
    '6. PURCHASER COMPLIANCE AND SERVICE DELIVERY',
    '6.1 At handover and throughout service delivery, the Purchaser must maintain all licences, registrations, insurance, police checks, training, inductions and approvals reasonably required for the Site and the services.',
    '6.2 The Purchaser must perform the accepted scope safely, professionally and on time; comply with applicable laws and Site rules; protect keys and access credentials; and promptly tell Secure Cleaning of any complaint, incident, cancellation risk or material service change.',
    '6.3 The Purchaser is responsible for its personnel, subcontractors, equipment, consumables and workplace obligations, unless the accepted scope expressly states otherwise.',
    '',
    '7. CONFIDENTIALITY, PRIVACY AND NON-CIRCUMVENTION',
    '7.1 Client identity, contact details, Site address, access information, security information, pricing and Secure Cleaning processes are confidential. The Purchaser may use them only to assess or perform the Contract and must protect them from unauthorised access or disclosure.',
    '7.2 Before handover, and if the purchase does not complete, the Purchaser must not bypass Secure Cleaning to obtain the same Site or client work using information supplied through this sale process.',
    '7.3 Clauses 7.1 and 7.2 continue after cancellation or completion only for as long as reasonably necessary to protect confidential information and Secure Cleaning’s legitimate interest in this transaction. They do not prevent lawful competition that does not use confidential information or involve the identified Site or opportunity.',
    '',
    '8. DEFAULT, CANCELLATION AND REMEDIES',
    '8.1 A material breach includes failure to pay an amount when due, unauthorised client contact or commencement, misuse of confidential information, loss of required approval or insurance, or a serious service or safety breach.',
    '8.2 Except where urgent action is reasonably needed to protect the client, Site or confidential information, the non-defaulting party must give written notice describing the breach and allow a reasonable opportunity to remedy it.',
    '8.3 If the breach is not remedied, Secure Cleaning may suspend the transaction or conditional servicing right, cancel the sale, recover possession or control of transaction materials, and seek its proven loss and reasonable recovery costs to the extent permitted by law. This clause does not impose a penalty or exclude rights that cannot lawfully be excluded.',
    '8.4 Any refund following cancellation will be determined by the reason for cancellation, work already performed, losses reasonably incurred, and applicable law. There is no automatic blanket exclusion of refunds.',
    '',
    '9. LIABILITY AND EVENTS OUTSIDE CONTROL',
    '9.1 Each party is responsible for loss caused by its breach, negligence or unlawful conduct. Neither party excludes liability that cannot legally be excluded.',
    '9.2 A party is not liable for delay caused by an event beyond its reasonable control if it promptly notifies the other party and takes reasonable steps to reduce the effect of the delay.',
    '',
    '10. DISPUTES, NOTICES AND GENERAL TERMS',
    '10.1 The parties must first try in good faith to resolve a dispute by direct discussion. If it remains unresolved, either party may propose mediation before commencing court proceedings, except for urgent relief or debt recovery.',
    `10.2 This Agreement is governed by the laws of ${governingLaw}. The parties submit to courts with jurisdiction there.`,
    '10.3 A variation must be recorded in writing and agreed by both parties. Secure Cleaning cannot change this signed Agreement unilaterally.',
    '10.4 If a provision is invalid or unenforceable, it is to be read down or severed to the minimum extent necessary without affecting the remaining provisions.',
    '10.5 This Agreement, its schedules, the accepted client scope and any signed payment plan record the entire agreement for this sale. Each party confirms it has had the opportunity to ask questions, negotiate terms and obtain independent legal, tax and financial advice.',
    '',
    '11. ACCEPTANCE AND EXECUTION',
    '11.1 This Agreement takes effect only when signed or otherwise accepted through an approved Secure Cleaning acceptance process by both parties. Paying a deposit or attending an inspection alone does not replace that acceptance.',
    '11.2 By signing, each signatory confirms they are authorised to bind the named party and that the details and schedules are complete and accurate.',
    '',
    'PURCHASER',
    'Name: ______________________________________________',
    'Position: ____________________________________________',
    'Signature: ___________________________________________',
    'Date: ________________________________________________',
    '',
    'SECURE CLEANING',
    'Authorised representative: ___________________________',
    'Signature: ___________________________________________',
    'Date: ________________________________________________',
    '',
    'IMPORTANT: This is a system-generated commercial agreement draft. It should be reviewed for the particular transaction and approved by an Australian lawyer before it becomes Secure Cleaning’s standard agreement. Until electronic acceptance is implemented, the uploaded signed PDF is the authoritative agreement record.',
  ].filter(Boolean).join('\n')
}

export function normalizeInvoiceEmail(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 320) : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}
