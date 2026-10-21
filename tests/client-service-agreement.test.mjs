import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const {
  CLIENT_SERVICE_AGREEMENT_NOTICE_DAYS,
  CLIENT_SERVICE_AGREEMENT_PUBLIC_LIABILITY,
  CLIENT_SERVICE_AGREEMENT_TERM_MONTHS,
  buildClientServiceAgreementContent,
  parseClientServiceAgreementDetails,
} = await import('../src/lib/clientServiceAgreementPolicy.ts')
const { buildContractSaleAgreementPdf } = await import('../src/lib/contractSaleAgreementDocument.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

const details = {
  agreementDate: '2026-10-21',
  secureCleaningLegalName: 'Secure Cleaning Australia Pty Ltd',
  secureCleaningAbn: '81 674 121 825',
  secureCleaningAddress: '',
  serviceProviderLegalName: 'Example Cleaning Pty Ltd',
  serviceProviderRepresentative: 'Alex Cleaner',
  serviceProviderAbn: '12 345 678 901',
  serviceProviderAddress: '1 Example Street, Sydney NSW 2000',
  serviceProviderEmail: 'alex@example.com',
  clientLegalName: 'Example Client Pty Ltd',
  clientAbn: '',
  clientAddress: '',
  clientContact: 'Sam Client',
  clientEmail: 'sam@example.com',
  siteName: 'Example Medical Centre',
  siteAddress: '2 Sample Road, Sydney NSW 2000',
  commencementDate: '2026-11-01',
  serviceFrequency: 'Weekly',
  serviceWindow: 'After hours',
  estimatedDuration: '3 hours per visit',
  routineFee: '$440.00 including GST per visit',
  billingParty: 'Service Provider',
  paymentTerms: '14 days from invoice',
  consumablesVariation: '',
  specialistItems: '',
  accessAndAlarm: { notApplicable: false, details: 'Key safe code provided separately.' },
  storage: { notApplicable: true, details: '' },
  security: { notApplicable: true, details: '' },
  hazardsAndInduction: { notApplicable: true, details: '' },
  infectionControl: { notApplicable: true, details: '' },
  exclusions: { notApplicable: true, details: '' },
  variations: { notApplicable: true, details: '' },
}

const scope = {
  formatVersion: 1,
  state: 'NSW',
  suburb: 'Sydney',
  premisesType: 'medical',
  floorArea: 200,
  floors: 1,
  frequency: 'weekly',
  timePreference: 'after_hours',
  estimatedHours: 3,
  summary: 'Recurring cleaning for a medical site in Sydney, NSW.',
  rooms: [{
    type: 'treatment_room', label: 'Treatment room', description: 'No doctor names retained',
    quantity: 4, size: 10, floor: 1,
    tasks: ['Vacuum floors', { label: 'Clean high-touch points', cadence: 'Every clean' }],
    selectedOptions: ['Mopping included'],
  }],
  selectedOptions: ['High-touch disinfection'],
}

test('client service agreement applies the approved commercial terms and appends the product scope', () => {
  assert.equal(CLIENT_SERVICE_AGREEMENT_TERM_MONTHS, 12)
  assert.equal(CLIENT_SERVICE_AGREEMENT_NOTICE_DAYS, 30)
  assert.equal(CLIENT_SERVICE_AGREEMENT_PUBLIC_LIABILITY, '$10,000,000')
  const parsed = parseClientServiceAgreementDetails(details)
  const content = buildClientServiceAgreementContent(parsed, scope)

  for (const phrase of [
    'initial term of 12 months',
    '30 days written notice',
    'public liability insurance of at least $10,000,000',
    'supplies ordinary equipment and Cleaning Chemicals',
    'Client supplies and maintains adequate Consumables',
    'Nothing in this Agreement creates a legal partnership',
    'APPENDIX A - SCOPE OF WORKS',
    'TREATMENT ROOM',
    'Vacuum floors',
    'Clean high-touch points - Every clean',
  ]) assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))

  assert.match(content, /Storage arrangements: Not applicable \[X\]/)
  assert.match(content, /Secure Cleaning: Secure Cleaning Australia Pty Ltd, ABN 81 674 121 825\n/)
  assert.doesNotMatch(content, /Schedule 1[^]*Treatment room[^]*Schedule 2/i)
  assert.doesNotMatch(content, /legal review|legal advice|lawyer review/i)
})

test('agreement details reject incomplete critical fields while preserving optional blanks', () => {
  const parsed = parseClientServiceAgreementDetails(details)
  assert.equal(parsed.clientAbn, '')
  assert.equal(parsed.secureCleaningAddress, '')
  assert.throws(() => parseClientServiceAgreementDetails({ ...details, clientLegalName: '' }), /client legal name/i)
  assert.throws(() => parseClientServiceAgreementDetails({ ...details, commencementDate: '21\/10\/2026' }), /valid commencement date/i)
})

test('client service agreement renders as a branded multi-page PDF', () => {
  const content = buildClientServiceAgreementContent(parseClientServiceAgreementDetails(details), scope)
  const pdf = buildContractSaleAgreementPdf({
    content,
    saleCode: 'PS-2026-01001',
    productCode: 'C001001',
    cleanerBusiness: details.serviceProviderLegalName,
    preparedBy: 'NSW Agent',
    preparedOn: '2026-10-21T00:00:00.000Z',
    documentTitle: 'Client service agreement',
    footerLabel: 'Agreement PS-2026-01001 v1',
  }).toString('latin1')
  assert.match(pdf, /^%PDF-1\.4/)
  for (const value of ['Client service agreement', 'AGREEMENT DETAILS', 'SERVICE PROVIDER', 'APPENDIX A - SCOPE OF WORKS', 'Agreement PS-2026-01001 v1']) assert.match(pdf, new RegExp(value))
  assert.match(pdf, /\/Count [2-9]/)
})

test('workflow persists immutable private versions and requires a signed client agreement at handover when selected', () => {
  const migration = source('supabase/migrations/20261021004942_client_service_agreement_workflow.sql')
  for (const pattern of [
    /CREATE TABLE IF NOT EXISTS public\.contract_sale_client_service_agreements/,
    /UNIQUE\(sale_id, version\)/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE ALL ON TABLE[^]*FROM PUBLIC, anon, authenticated/,
    /GRANT SELECT, INSERT, UPDATE, DELETE[^]*TO service_role/,
    /Client service agreement snapshots are immutable/,
    /product_row\.formal_contract OR EXISTS/,
    /ORDER BY agreement\.version DESC/,
    /Upload the signed latest client service agreement before handover/,
  ]) assert.match(migration, pattern)

  const api = source('src/app/api/admin/contract-sales/client-service-agreements/route.ts')
  assert.match(api, /getContractProductActor/)
  assert.match(api, /rejectCrossOriginMutation/)
  assert.match(api, /rejectLargePayload/)
  assert.match(api, /client-service-agreement-download/)
  assert.match(api, /client-service-agreement-upload/)
  assert.match(api, /Cache-Control': 'private, no-store'/)

  const workspace = source('src/components/admin/ContractSalesWorkspace.tsx')
  assert.match(workspace, /Client service agreement/)
  assert.match(workspace, /Create updated agreement version/)
  assert.match(workspace, /Upload signed PDF/)
  assert.match(workspace, /product\.formalContract \|\| sale\.clientServiceAgreement \? 'signed client service agreement/)
  const productWorkspace = source('src/components/admin/ContractProductsWorkspace.tsx')
  assert.match(productWorkspace, /Client service agreement required/)
})
