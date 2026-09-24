import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('CRM deletion is owner-only and requires reviewed confirmation', () => {
  const route = source('src/app/api/admin/client-crm/[opportunityId]/deletion/route.ts')
  const helper = source('src/lib/clientCrmDeletion.ts')
  const component = source('src/components/admin/DeleteClientCrmButton.tsx')

  assert.match(route, /isAuthorizedAdminRequest\(request, 'owner'\)/)
  assert.match(route, /identity\.role !== 'owner'/)
  assert.match(route, /rejectCrossOriginMutation\(request\)/)
  assert.match(route, /rejectLargePayload\(request, 4 \* 1024\)/)
  assert.match(helper, /confirmation !== preview\.confirmationValue/)
  assert.match(helper, /previewToken/)
  assert.match(component, /Reason for deletion/)
  assert.match(component, /Permanently delete client/)
})

test('CRM deletion archives the chain and retains quote and financial safeguards', () => {
  const migration = source('supabase/client_crm_deletion_migration.sql')
  const bookingLineageFix = source('supabase/client_crm_deletion_booking_lineage_fix_migration.sql')

  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /FOR SHARE/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /client_crm_deletion_archive/)
  assert.match(migration, /crm_opportunity_quotes/)
  assert.match(migration, /contract_products/)
  assert.match(migration, /contract_product_sales/)
  assert.match(migration, /contract_sales/)
  assert.match(migration, /owner_operator_ratings/)
  assert.match(migration, /Deletion preview changed/)
  assert.match(migration, /Owner override is required/)
  assert.match(migration, /Records outside this client chain still reference/)
  assert.match(migration, /previous_opportunity_id = ANY\(opportunity_ids\)/)
  assert.match(migration, /converted_to_client_id = ANY\(contact_ids\)/)
  assert.match(migration, /'client_crm_deleted'/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_delete_client_crm_record/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_delete_client_crm_record/)
  assert.match(bookingLineageFix, /WHERE client_id = ANY\(contact_ids\) OR opportunity_id = ANY\(opportunity_ids\);/)
  assert.match(bookingLineageFix, /WHERE id <> ALL\(booking_ids\) AND site_id = ANY\(site_ids\)/)
  assert.doesNotMatch(
    bookingLineageFix,
    /WHERE id = ANY\(booking_ids\) AND \([\s\S]*site_id IS NOT NULL AND site_id <> ALL\(site_ids\)/
  )
})

test('only owners see the CRM customer deletion control', () => {
  const workspace = source('src/components/admin/ClientCrmWorkspace.tsx')
  assert.match(workspace, /data\.actor\.role === 'owner' \? <DeleteClientCrmButton/)
  assert.match(workspace, /setSelectedLeadId\(''\)/)
  assert.match(workspace, /void loadWorkspace\(\)/)
})
