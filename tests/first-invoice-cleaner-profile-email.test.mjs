import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const projectRoot = new URL('..', import.meta.url).pathname
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('first sent invoice reserves one cleaner profile email and later invoices cannot duplicate it', () => {
  const domain = source('src/lib/contractSales.ts')
  const migration = source('supabase/contract_sale_first_invoice_cleaner_profile_migration.sql')
  const sendBundle = domain.slice(domain.indexOf('export async function sendContractSaleAgreement'))

  assert.match(migration, /cleaner_id UUID NOT NULL UNIQUE/)
  assert.match(migration, /invoice_id UUID NOT NULL UNIQUE/)
  assert.match(migration, /invoice_row\.delivery_status::TEXT <> 'sent'/)
  assert.match(migration, /prior_invoice\.delivery_status::TEXT = 'sent'/)
  assert.match(migration, /actor_role = 'agent' AND sale_row\.assigned_staff_id IS DISTINCT FROM p_actor_id/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_contract_sale_cleaner_profile_request[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.ok(sendBundle.indexOf("delivery_status: providerMessageId ? 'sent'") < sendBundle.indexOf('sendFirstInvoiceCleanerProfileEmail'))
  assert.doesNotMatch(domain.slice(domain.indexOf('export async function resendContractSaleInvoice'), domain.indexOf('export async function downloadContractSaleInvoice')), /sendFirstInvoiceCleanerProfileEmail/)
})

test('profile email uses the secure cleaner portal and copies only the active sale-creating agent', () => {
  const domain = source('src/lib/contractSales.ts')
  const portal = source('src/lib/cleanerPortal.ts')

  assert.match(domain, /createCleanerPortalLink\(\{ mode: 'update'/)
  assert.match(domain, /context\.creatorStaff\.active === true && context\.creatorStaff\.role === 'agent'/)
  assert.match(domain, /\.\.\.\(creatorEmail \? \{ cc: \[creatorEmail\] \} : \{\}\)/)
  assert.match(portal, /export function createCleanerPortalLink/)
  assert.match(portal, /createCleanerPortalToken\(input\)/)
})

test('owners and managers can review the first-purchase email with the rich text editor', () => {
  const route = source('src/app/api/admin/contract-sales/route.ts')
  const workspace = source('src/components/admin/ContractSalesWorkspace.tsx')
  const domain = source('src/lib/contractSales.ts')

  assert.match(route, /cleaner-profile-template\.update/)
  assert.match(domain, /Only an owner or manager can edit the first-purchase profile email template/)
  assert.match(domain, /Include <<profile_update_link>> in the profile-update email/)
  assert.match(workspace, /First-purchase cleaner details email/)
  assert.match(workspace, /RichEmailEditor/)
  assert.match(workspace, /CLEANER_PROFILE_UPDATE_EMAIL_MERGE_FIELDS/)
})
