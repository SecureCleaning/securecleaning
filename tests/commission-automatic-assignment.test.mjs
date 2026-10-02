import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/contract_sale_automatic_commission_assignment_migration.sql', import.meta.url), 'utf8')
const domain = readFileSync(new URL('../src/lib/commissions.ts', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../src/components/admin/CommissionsWorkspace.tsx', import.meta.url), 'utf8')

test('new sales use durable quote sender and sale creator attribution', () => {
  assert.match(migration, /quote\.final_quote_sent_by->>'kind' = 'staff_account'/)
  assert.match(migration, /quote\.final_quote_sent_by->>'kind' = 'agent_session'/)
  assert.match(migration, /NEW\.created_by_staff_id/)
  assert.match(migration, /staff\.active = true[\s\S]+staff\.role::text = 'agent'/)
  assert.match(migration, /INSERT INTO contract_commission_assignments/)
  assert.match(migration, /ON CONFLICT \(sale_id\) DO NOTHING/)
  assert.match(migration, /commission\.auto_assigned/)
  assert.doesNotMatch(migration, /INSERT INTO contract_commission_assignments[^;]*\bSELECT\b/)
})

test('owner correction preserves rates and closes after an invoice or payout', () => {
  assert.match(migration, /p_action='correct'/)
  assert.match(migration, /actor_role<>'owner'/)
  assert.match(migration, /contract_commission_claims WHERE sale_id=sid/)
  assert.match(migration, /contract_commission_payouts WHERE sale_id=sid/)
  assert.match(migration, /SET win_agent_id=w,sale_agent_id=a/)
  assert.doesNotMatch(migration, /SET win_agent_id=w,sale_agent_id=a,win_bps/)
  assert.match(migration, /commission\.assignment_corrected/)
  assert.match(domain, /'settings', 'assign', 'correct', 'claim', 'payout'/)
  assert.match(workspace, /Review assigned commissions/)
  assert.match(workspace, /Save correction/)
  assert.match(workspace, /Agent attribution corrections close after an invoice or payout/ )
  assert.match(workspace, /Revise commission/)
})
