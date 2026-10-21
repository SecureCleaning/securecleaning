import type { CleanerScopeSnapshotV1, CleanerScopeTask } from '@/lib/contractProductPolicy'

export type ClientServiceAgreementRequirement = {
  notApplicable: boolean
  details: string
}

export type ClientServiceAgreementDetails = {
  agreementDate: string
  secureCleaningLegalName: string
  secureCleaningAbn: string
  secureCleaningAddress: string
  serviceProviderLegalName: string
  serviceProviderRepresentative: string
  serviceProviderAbn: string
  serviceProviderAddress: string
  serviceProviderEmail: string
  clientLegalName: string
  clientAbn: string
  clientAddress: string
  clientContact: string
  clientEmail: string
  siteName: string
  siteAddress: string
  commencementDate: string
  serviceFrequency: string
  serviceWindow: string
  estimatedDuration: string
  routineFee: string
  billingParty: string
  paymentTerms: string
  consumablesVariation: string
  specialistItems: string
  accessAndAlarm: ClientServiceAgreementRequirement
  storage: ClientServiceAgreementRequirement
  security: ClientServiceAgreementRequirement
  hazardsAndInduction: ClientServiceAgreementRequirement
  infectionControl: ClientServiceAgreementRequirement
  exclusions: ClientServiceAgreementRequirement
  variations: ClientServiceAgreementRequirement
}

export const CLIENT_SERVICE_AGREEMENT_TEMPLATE_VERSION = 1
export const CLIENT_SERVICE_AGREEMENT_TERM_MONTHS = 12
export const CLIENT_SERVICE_AGREEMENT_NOTICE_DAYS = 30
export const CLIENT_SERVICE_AGREEMENT_PUBLIC_LIABILITY = '$10,000,000'

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function date(value: unknown, label: string) {
  const normalized = text(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`Enter a valid ${label}.`)
  return normalized
}

function requirement(value: unknown): ClientServiceAgreementRequirement {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { notApplicable: source.notApplicable === true, details: text(source.details, 2000) }
}

export function parseClientServiceAgreementDetails(value: unknown): ClientServiceAgreementDetails {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const parsed: ClientServiceAgreementDetails = {
    agreementDate: date(source.agreementDate, 'agreement date'),
    secureCleaningLegalName: text(source.secureCleaningLegalName, 200),
    secureCleaningAbn: text(source.secureCleaningAbn, 32),
    secureCleaningAddress: text(source.secureCleaningAddress, 500),
    serviceProviderLegalName: text(source.serviceProviderLegalName, 200),
    serviceProviderRepresentative: text(source.serviceProviderRepresentative, 200),
    serviceProviderAbn: text(source.serviceProviderAbn, 32),
    serviceProviderAddress: text(source.serviceProviderAddress, 500),
    serviceProviderEmail: text(source.serviceProviderEmail, 320),
    clientLegalName: text(source.clientLegalName, 200),
    clientAbn: text(source.clientAbn, 32),
    clientAddress: text(source.clientAddress, 500),
    clientContact: text(source.clientContact, 200),
    clientEmail: text(source.clientEmail, 320),
    siteName: text(source.siteName, 200),
    siteAddress: text(source.siteAddress, 500),
    commencementDate: date(source.commencementDate, 'commencement date'),
    serviceFrequency: text(source.serviceFrequency, 160),
    serviceWindow: text(source.serviceWindow, 300),
    estimatedDuration: text(source.estimatedDuration, 160),
    routineFee: text(source.routineFee, 200),
    billingParty: text(source.billingParty, 200),
    paymentTerms: text(source.paymentTerms, 500),
    consumablesVariation: text(source.consumablesVariation, 2000),
    specialistItems: text(source.specialistItems, 2000),
    accessAndAlarm: requirement(source.accessAndAlarm),
    storage: requirement(source.storage),
    security: requirement(source.security),
    hazardsAndInduction: requirement(source.hazardsAndInduction),
    infectionControl: requirement(source.infectionControl),
    exclusions: requirement(source.exclusions),
    variations: requirement(source.variations),
  }
  for (const [label, field] of [
    ['Secure Cleaning legal name', parsed.secureCleaningLegalName],
    ['service provider legal name', parsed.serviceProviderLegalName],
    ['client legal name', parsed.clientLegalName],
    ['site address', parsed.siteAddress],
    ['service frequency', parsed.serviceFrequency],
    ['routine fee', parsed.routineFee],
    ['billing party', parsed.billingParty],
    ['payment terms', parsed.paymentTerms],
  ] as const) if (!field) throw new Error(`Enter the ${label}.`)
  return parsed
}

function valueOrBlank(value: string) {
  return value || '____________________________________________'
}

function requirementLine(label: string, value: ClientServiceAgreementRequirement) {
  return `${label}: Not applicable ${value.notApplicable ? '[X]' : '[ ]'}${value.details ? ` | ${value.details}` : ''}`
}

function taskText(task: CleanerScopeTask) {
  if (typeof task === 'string') return task
  const source = task as unknown as Record<string, unknown>
  const label = text(source.label ?? source.task ?? source.name, 500)
  const cadence = text(source.cadence, 120)
  return [label, cadence].filter(Boolean).join(' - ')
}

function scopeLines(scope: CleanerScopeSnapshotV1) {
  const lines = [
    'APPENDIX A - SCOPE OF WORKS',
    `Summary: ${scope.summary}`,
    `Premises type: ${scope.premisesType}`,
    `Floor area: ${scope.floorArea} sqm across ${scope.floors} floor(s)`,
    `Frequency: ${scope.frequency}`,
    `Cleaning timing: ${scope.timePreference}`,
    `Estimated duration: ${scope.estimatedHours || 0} hours per visit`,
    '',
  ]
  scope.rooms.forEach((room, index) => {
    lines.push(`${index + 1}. ${room.label.toUpperCase()}`)
    lines.push(`Quantity / size / floor: ${room.quantity} / ${room.size} sqm / Floor ${room.floor}`)
    if (room.description) lines.push(`Description: ${room.description}`)
    room.tasks.map(taskText).filter(Boolean).forEach((task) => lines.push(`- ${task}`))
    ;(room.selectedOptions ?? []).forEach((option) => lines.push(`- ${option}`))
    lines.push('')
  })
  if (scope.selectedOptions.length) {
    lines.push('SITE-WIDE SELECTED ITEMS')
    scope.selectedOptions.forEach((option) => lines.push(`- ${option}`))
  }
  return lines
}

export function buildClientServiceAgreementContent(details: ClientServiceAgreementDetails, scope: CleanerScopeSnapshotV1) {
  return [
    'SECURE CLEANING - COMMERCIAL CLEANING SERVICES AGREEMENT',
    'DRAFT FOR REVIEW AND SIGNATURE',
    '',
    'AGREEMENT DETAILS',
    `Agreement date: ${details.agreementDate}`,
    `Secure Cleaning: ${details.secureCleaningLegalName}${details.secureCleaningAbn ? `, ABN ${details.secureCleaningAbn}` : ''}${details.secureCleaningAddress ? `, of ${details.secureCleaningAddress}` : ''}`,
    `Service Provider: ${details.serviceProviderLegalName}${details.serviceProviderAbn ? `, ABN ${details.serviceProviderAbn}` : ''}${details.serviceProviderAddress ? `, of ${details.serviceProviderAddress}` : ''}`,
    `Service Provider representative: ${valueOrBlank(details.serviceProviderRepresentative)}`,
    `Client: ${details.clientLegalName}${details.clientAbn ? `, ABN/ACN ${details.clientAbn}` : ''}${details.clientAddress ? `, of ${details.clientAddress}` : ''}`,
    `Client contact: ${valueOrBlank(details.clientContact)}`,
    `Site: ${details.siteName ? `${details.siteName}, ` : ''}${details.siteAddress}`,
    `Commencement date: ${details.commencementDate}`,
    `Initial term: ${CLIENT_SERVICE_AGREEMENT_TERM_MONTHS} months from the Commencement Date, unless ended earlier under clause 15`,
    `Routine fee: ${details.routineFee}`,
    `Billing party: ${details.billingParty}`,
    `Payment terms: ${details.paymentTerms}`,
    '',
    'BACKGROUND',
    'A. The Client requires recurring commercial cleaning services at the Site.',
    'B. Secure Cleaning coordinates the service arrangement and has nominated the Service Provider to perform the Services.',
    'C. The parties want their responsibilities, the Scope of Works and the commercial terms recorded in this Agreement.',
    '',
    '1. DEFINITIONS AND INTERPRETATION',
    '1.1 Agreement means these terms, the Agreement Details, each Schedule, Appendix A, the accepted quote and any written variation accepted by the parties.',
    '1.2 Cleaning Chemicals means ordinary commercial cleaning agents and disinfectants reasonably required to perform the Scope of Works. It excludes Consumables and specialist chemicals unless Schedule 2 says otherwise.',
    '1.3 Consumables means disposable items used by the Client or its personnel, visitors or customers, including toilet paper, hand towels, hand soap, bin liners and sanitary products.',
    '1.4 Scope of Works means the final room, area, task, frequency and service details automatically attached to the rear of this Agreement as Appendix A.',
    '',
    '2. APPOINTMENT AND ROLES',
    '2.1 The Client appoints Secure Cleaning to coordinate the arrangement and appoints the Service Provider to perform the Services during the Term. Each accepts its appointment.',
    '2.2 The Service Provider is responsible for day-to-day performance. The Billing Party issues invoices and receives payment. Payment to the Billing Party satisfies the Client payment obligation for that invoice.',
    '2.3 Secure Cleaning may monitor quality, manage documentation, assist with complaints and arrange a suitably qualified replacement provider where reasonably required.',
    '2.4 Nothing in this Agreement creates a legal partnership, joint venture, employment relationship, fiduciary relationship or agency between Secure Cleaning and the Service Provider, or authorises either to bind the other except as expressly stated.',
    '',
    '3. TERM AND CONTINUATION',
    `3.1 This Agreement starts on the Commencement Date and continues for an initial term of ${CLIENT_SERVICE_AGREEMENT_TERM_MONTHS} months unless ended earlier under clause 15.`,
    '3.2 After the initial term, it continues month-to-month on the same terms, subject to clause 8, until ended under clause 15.',
    '',
    '4. SERVICES AND SERVICE STANDARD',
    '4.1 The Service Provider must perform the Services with due care and skill, professionally and on time, in accordance with Appendix A, applicable laws, safety requirements and reasonable Site policies notified in advance.',
    '4.2 The Services include routine labour, ordinary cleaning equipment and Cleaning Chemicals. Consumables are excluded unless Schedule 2 expressly identifies them as included.',
    '4.3 The parties must agree any material change to the Scope of Works, frequency, Site, service window or price in writing before it takes effect, except for an urgent temporary safety direction.',
    '',
    '5. EXCLUDED AND ADDITIONAL SERVICES',
    '5.1 Unless Appendix A expressly includes them, the Services exclude high-access work, external windows, carpet extraction, pest treatment, mould or hazardous-material remediation, biohazard or sharps handling, infectious-disease decontamination, restoration work, pressure washing and work requiring a specialist licence or equipment.',
    '5.2 Work outside Appendix A requires a written quotation accepted by the Client before it begins, except for immediate work authorised to prevent injury or material property damage.',
    '',
    '6. CLIENT RESPONSIBILITIES',
    '6.1 The Client must provide safe and timely access, electricity, hot and cold water, suitable agreed storage, accurate access instructions and a safe working environment.',
    '6.2 The Client must disclose known hazards, restricted areas, infection controls, asbestos, hazardous chemicals, sharps risks, security requirements and induction requirements before Services begin and when circumstances change.',
    '6.3 The Client must secure cash, valuables, confidential documents, controlled substances and fragile items, and nominate a contact authorised to approve variations and respond to access or safety issues.',
    '',
    '7. CHEMICALS, EQUIPMENT AND CONSUMABLES',
    '7.1 The Service Provider supplies ordinary equipment and Cleaning Chemicals and must use, label, store and handle them in accordance with manufacturer instructions, safety data sheets and applicable work health and safety laws.',
    '7.2 The Client supplies and maintains adequate Consumables unless Schedule 2 identifies a particular item as included. Any additional supply must be agreed as a written variation.',
    '7.3 A prohibited chemical must not be used where the Client has documented a reasonable health, safety, material-compatibility or environmental concern. The parties will agree a suitable alternative and any resulting price or scope change.',
    '',
    '8. FEES, GST AND ANNUAL CPI REVIEW',
    '8.1 The Client must pay the Routine Fee and approved additional charges to the Billing Party within the Payment Terms. Amounts are exclusive of GST unless expressly stated otherwise.',
    '8.2 On each anniversary after the initial 12-month term, the Routine Fee may be adjusted by the percentage change in the Australian Bureau of Statistics Consumer Price Index, All Groups, Weighted Average of Eight Capital Cities, comparing the most recently published quarter with the corresponding quarter one year earlier.',
    '8.3 The adjusted fee equals the current fee multiplied by the later index and divided by the earlier index. No adjustment applies for a zero or negative movement. The closest equivalent ABS series applies if the nominated series is discontinued or materially changed.',
    `8.4 The Billing Party must give at least ${CLIENT_SERVICE_AGREEMENT_NOTICE_DAYS} days written notice and show the index figures and calculation. The Client may terminate before the adjustment takes effect without an early termination charge.`,
    '',
    '9. ACCESS, SECURITY AND KEYS',
    '9.1 Keys, passes, alarm codes and access credentials remain confidential and may only be used for the Services. Loss or suspected compromise must be reported promptly.',
    '9.2 The Client must tell the Service Provider about access changes. A failed visit caused by unavailable or inaccurate access may be charged where the Service Provider attended as agreed and took reasonable steps to contact the Client.',
    '',
    '10. WORK HEALTH AND SAFETY',
    '10.1 Each party must comply with applicable work health and safety duties and cooperate in consultation, risk controls, incident reporting and emergency procedures.',
    '10.2 A party may pause affected work while a genuine safety risk is assessed and controlled. The parties will minimise disruption and agree any lasting scope or cost change in writing.',
    '',
    '11. QUALITY, COMPLAINTS AND RECTIFICATION',
    '11.1 The Client should report a service concern promptly with reasonable detail. The Service Provider must investigate and, where responsible, rectify it within a reasonable time at no additional charge.',
    '11.2 Repeated material failures may be escalated to Secure Cleaning and may justify replacement of the Service Provider or termination under clause 15.',
    '',
    '12. INVOICING AND PAYMENT',
    '12.1 A valid invoice must identify the relevant service period, GST where applicable and approved additional work. The Client must notify a genuine invoice dispute promptly and pay the undisputed amount when due.',
    '12.2 Overdue undisputed amounts may attract reasonable recovery costs and interest to the extent permitted by law after written notice and a reasonable opportunity to pay.',
    '',
    '13. INSURANCE',
    `13.1 The Service Provider must maintain workers compensation insurance where required by law, public liability insurance of at least ${CLIENT_SERVICE_AGREEMENT_PUBLIC_LIABILITY} for each occurrence and any other insurance reasonably required for the Services. Evidence of currency must be provided on reasonable request.`,
    '',
    '14. LIABILITY',
    '14.1 Each party is responsible for loss caused by its breach, negligence or unlawful conduct. No party excludes liability that cannot lawfully be excluded.',
    '14.2 Subject to rights that cannot be limited, no party is liable for indirect or consequential loss that was not reasonably foreseeable when this Agreement was made.',
    '',
    '15. TERMINATION',
    `15.1 Any party may terminate this Agreement for convenience by giving at least ${CLIENT_SERVICE_AGREEMENT_NOTICE_DAYS} days written notice. No early termination fee applies.`,
    '15.2 A party may terminate for a material breach that is not remedied within 10 business days after written notice, or immediately for serious safety misconduct, fraud, insolvency, loss of required insurance or unlawful conduct where continuation is unreasonable.',
    '15.3 On termination, the Client must pay for Services properly supplied to the termination date. Access items and confidential information must be returned, deleted or disabled as appropriate.',
    '',
    '16. CONFIDENTIALITY AND PRIVACY',
    '16.1 Each party must protect confidential and personal information obtained through the Services, use it only for this Agreement and disclose it only where authorised or required by law.',
    '16.2 Security information, access credentials, client information and personnel records must be restricted to people who need them for the Services.',
    '',
    '17. REPLACEMENT SERVICE PROVIDER AND FORCE MAJEURE',
    '17.1 Secure Cleaning may nominate a suitably qualified replacement Service Provider after consultation where the existing provider cannot continue or where replacement reasonably protects service continuity, quality or safety.',
    '17.2 A party is not liable for delay caused by an event beyond its reasonable control if it promptly notifies the others and takes reasonable steps to reduce the effect. Fees are adjusted for Services not supplied.',
    '',
    '18. DISPUTES',
    '18.1 A party raising a dispute must give written notice. Senior representatives must confer in good faith and, if unresolved, attempt mediation before court proceedings, except for urgent relief or recovery of an undisputed debt.',
    '',
    '19. NOTICES',
    '19.1 A notice must be in writing and sent to the contact and email address in Schedule 3 or a replacement address notified in writing.',
    '19.2 Email is received when the sender records successful transmission unless an automated failure notice is received. Email received after 5:00 pm at the recipient location is taken received the next business day.',
    '',
    '20. GENERAL',
    '20.1 This Agreement records the entire agreement about its subject matter, subject to rights that cannot lawfully be excluded. A variation or waiver must be in writing and accepted by authorised representatives.',
    '20.2 A party may not assign this Agreement without prior written consent, which must not be unreasonably withheld, except for a bona fide Secure Cleaning group restructure with written notice and assumption of obligations.',
    '20.3 Invalid provisions are read down or severed. The remaining provisions continue. This Agreement may be signed in counterparts and electronically.',
    `20.4 This Agreement is governed by the laws of ${scope.state}, Australia, and the parties submit to its courts and tribunals.`,
    '',
    'SCHEDULE 1 - SCOPE AND SERVICE DETAILS',
    `Site name: ${valueOrBlank(details.siteName)}`,
    `Service address: ${details.siteAddress}`,
    `Client site contact: ${valueOrBlank(details.clientContact)}`,
    `Start date: ${details.commencementDate}`,
    `Service frequency: ${details.serviceFrequency}`,
    `Service days and window: ${valueOrBlank(details.serviceWindow)}`,
    `Estimated service duration: ${valueOrBlank(details.estimatedDuration)}`,
    `Routine fee: ${details.routineFee}`,
    `Billing party: ${details.billingParty}`,
    `Payment terms: ${details.paymentTerms}`,
    '',
    'SCHEDULE 2 - CHEMICALS, EQUIPMENT AND CONSUMABLES',
    'Routine cleaning chemicals: supplied by Service Provider and included in the Routine Fee.',
    'Ordinary cleaning equipment: supplied by Service Provider and included in the Routine Fee.',
    'Toilet paper, paper hand towels, hand soap and bin liners: supplied by Client unless varied below.',
    `Consumables variation: ${valueOrBlank(details.consumablesVariation)}`,
    `Specialist chemicals or equipment: ${valueOrBlank(details.specialistItems)}`,
    '',
    'SITE-SPECIFIC REQUIREMENTS AND EXCLUSIONS',
    requirementLine('Access and alarm instructions', details.accessAndAlarm),
    requirementLine('Storage arrangements', details.storage),
    requirementLine('Security or confidentiality requirements', details.security),
    requirementLine('Known hazards and induction requirements', details.hazardsAndInduction),
    requirementLine('Special infection-control requirements', details.infectionControl),
    requirementLine('Agreed exclusions', details.exclusions),
    requirementLine('Approved variations', details.variations),
    '',
    'SCHEDULE 3 - CONTACTS AND NOTICES',
    `Secure Cleaning: ${details.secureCleaningLegalName} | ${valueOrBlank(details.secureCleaningAddress)}`,
    `Service Provider: ${details.serviceProviderRepresentative || details.serviceProviderLegalName} | ${valueOrBlank(details.serviceProviderEmail)}`,
    `Client: ${details.clientContact || details.clientLegalName} | ${valueOrBlank(details.clientEmail)}`,
    '',
    'EXECUTION',
    'By signing, each signatory confirms that they are authorised to bind the named party.',
    '',
    'SECURE CLEANING',
    'Signature: ___________________________________________',
    'Name: ______________________________________________',
    'Position: ____________________________________________',
    'Date: ________________________________________________',
    '',
    'SERVICE PROVIDER',
    'Signature: ___________________________________________',
    'Name: ______________________________________________',
    'Position: ____________________________________________',
    'Date: ________________________________________________',
    '',
    'CLIENT',
    'Signature: ___________________________________________',
    'Name: ______________________________________________',
    'Position: ____________________________________________',
    'Date: ________________________________________________',
    '',
    ...scopeLines(scope),
  ].join('\n')
}
