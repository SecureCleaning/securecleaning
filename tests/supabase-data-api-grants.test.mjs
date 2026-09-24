import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationName = 'data_api_explicit_grants_migration.sql'
const migration = readFileSync(`${root}/supabase/${migrationName}`, 'utf8')
const sqlFiles = readdirSync(`${root}/supabase`).filter((name) => name.endsWith('.sql'))

function createdTables(source) {
  return [...source.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)]
    .map((match) => match[1])
}

function createdSequences(source) {
  return [...source.matchAll(/CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)]
    .map((match) => match[1])
}

const legacyTableFiles = new Set([
  'audit_log_migration.sql',
  'cleaner_documents_migration.sql',
  'cleaner_email_delivery_migration.sql',
  'cleaner_email_large_campaigns_migration.sql',
  'cleaners_migration.sql',
  'client_crm_deletion_migration.sql',
  'client_crm_foundation_migration.sql',
  'client_crm_profile_notes_migration.sql',
  'consumables_catalogue_migration.sql',
  'contract_product_broadcast_templates_and_targeting_migration.sql',
  'contract_product_sales_migration.sql',
  'contract_products_interest_notifications_migration.sql',
  'contract_products_migration.sql',
  'contract_sale_commissions_plans_migration.sql',
  'contract_sale_inspection_communications_checklist_migration.sql',
  'contract_sale_invoice_bank_details_migration.sql',
  'contract_sale_tax_invoice_workflow_migration.sql',
  'final_quote_revision_migration.sql',
  'final_quote_scope_workflow_migration.sql',
  'owner_quote_deletion_override_migration.sql',
  'reconcile_connected_project.sql',
  'schema.sql',
  'sites_migration.sql',
  'staff_accounts_migration.sql',
])

test('Data API hardening covers every table and sequence created by the repository', () => {
  const tableNames = new Set()
  const sequenceNames = new Set(['contract_sale_invoice_bank_revisions_id_seq'])
  for (const name of sqlFiles) {
    const source = readFileSync(`${root}/supabase/${name}`, 'utf8')
    for (const table of createdTables(source)) tableNames.add(table)
    for (const sequence of createdSequences(source)) sequenceNames.add(sequence)
  }

  for (const table of [...tableNames].sort()) {
    assert.match(migration, new RegExp(`'${table}'`), `${table} is missing from the explicit Data API table grants`)
  }
  for (const sequence of [...sequenceNames].sort()) {
    assert.match(migration, new RegExp(`'${sequence}'`), `${sequence} is missing from the explicit Data API sequence grants`)
  }
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO service_role/)
  assert.match(migration, /GRANT USAGE, SELECT ON SEQUENCE public\.%I TO service_role/)
  assert.match(migration, /GRANT SELECT ON TABLE public\.site_content TO anon, authenticated/)
  assert.doesNotMatch(migration, /GRANT (?:ALL|SELECT, INSERT, UPDATE, DELETE)[^;]+TO anon/)
})

test('future table-creating migrations must grant service-role access in the same file', () => {
  for (const name of sqlFiles) {
    if (name === migrationName || legacyTableFiles.has(name)) continue
    const source = readFileSync(`${root}/supabase/${name}`, 'utf8')
    for (const table of createdTables(source)) {
      assert.match(
        source,
        new RegExp(`GRANT[\\s\\S]*\\b${table}\\b[\\s\\S]*TO\\s+service_role`, 'i'),
        `${name} must grant service_role access to ${table}`
      )
    }
  }
})
