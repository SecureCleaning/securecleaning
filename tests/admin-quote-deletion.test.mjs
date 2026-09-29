import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('quote deletion is owner-only and requires an exact typed reference', () => {
  const route = source('src/app/api/admin/quotes/[ref]/deletion/route.ts')
  const component = source('src/components/admin/DeleteQuoteButton.tsx')

  assert.match(route, /isAuthorizedAdminRequest\(request, 'owner'\)/)
  assert.match(route, /identity\.role !== 'owner'/)
  assert.match(route, /rejectCrossOriginMutation\(request\)/)
  assert.match(route, /rejectLargePayload\(request, 4 \* 1024\)/)
  assert.match(route, /confirmation/)
  assert.match(route, /reason/)
  assert.match(component, /confirmation !== quoteRef/)
  assert.match(component, /Reason for deletion/)
  assert.match(component, /Permanently delete quote/)
})

test('transactional quote deletion preserves business records and blocks product dependencies', () => {
  const migration = source('supabase/admin_quote_deletion_migration.sql')
  const deletion = source('src/lib/quoteDeletion.ts')

  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /contract_products/)
  assert.match(migration, /contract_product_sales/)
  assert.match(migration, /Quotes linked to a contract product or sale cannot be deleted/)
  assert.match(migration, /Quotes linked to a booking cannot be deleted/)
  assert.match(migration, /Winning opportunity quotes cannot be deleted/)
  assert.match(migration, /Quotes with a sent final document cannot be deleted/)
  assert.match(migration, /FROM public\.quote_final_document_versions/)
  assert.doesNotMatch(migration, /public\.final_quote_document_versions/)
  assert.match(deletion, /admin_preview_quote_deletion/)
  assert.doesNotMatch(deletion, /db\.from\('final_quote_document_versions'\)/)
  assert.match(migration, /DELETE FROM public\.crm_opportunity_quotes/)
  assert.doesNotMatch(migration, /UPDATE public\.bookings/)
  assert.doesNotMatch(migration, /DELETE FROM public\.bookings/)
  assert.doesNotMatch(migration, /DELETE FROM public\.crm_opportunities/)
  assert.match(migration, /'quote_deleted'/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_delete_quote\(TEXT, TEXT, JSONB\) FROM PUBLIC/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_delete_quote\(TEXT, TEXT, JSONB\) TO service_role/)
})

test('dashboard only renders quote deletion for authorized owners and removes deleted rows immediately', () => {
  const dashboard = source('src/components/admin/AdminDashboard.tsx')
  const page = source('src/app/admin/page.tsx')

  assert.match(page, /hasAdminRole\(identity\.role, 'owner'\)/)
  assert.match(dashboard, /canDeleteQuotes \? \(/)
  assert.match(dashboard, /<DeleteQuoteButton/)
  assert.match(dashboard, /current\.filter\(\(item\) => item\.quote_ref !== quoteRef\)/)
})
