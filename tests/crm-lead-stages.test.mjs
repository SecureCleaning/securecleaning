import test from 'node:test'
import assert from 'node:assert/strict'
import { crmLeadStage, isCrmLeadOverdue } from '../src/lib/crmLeadStages.ts'

test('existing CRM codes map to clear labels and distinct stage shading', () => {
  const expected={new:'Not contacted',contacted:'Contacted',inspection:'Inspection booked',quoting:'Quote in progress',proposal_sent:'Quote sent',won:'Won',lost:'Lost / Not proceeding'}
  for(const [stage,label] of Object.entries(expected)) assert.equal(crmLeadStage(stage).label,label)
  assert.equal(new Set(Object.keys(expected).map(stage=>crmLeadStage(stage).colour)).size,7)
  assert.deepEqual(crmLeadStage('qualified'),crmLeadStage('contacted'))
})
test('overdue badges exclude closed records and invalid or future dates', () => {
  const now=Date.parse('2026-10-29T00:00:00Z')
  for(const stage of ['new','contacted','inspection','quoting','proposal_sent']) assert.equal(isCrmLeadOverdue(stage,'2026-10-28T00:00:00Z',now),true)
  for(const stage of ['won','lost','cancelled']) assert.equal(isCrmLeadOverdue(stage,'2026-10-28T00:00:00Z',now),false)
  for(const date of [null,'invalid','2026-10-30T00:00:00Z']) assert.equal(isCrmLeadOverdue('new',date,now),false)
})

// The existing sync transaction keeps all assignment/identity/authorization behavior.
test('inbound sync stops treating an enquiry as contact, with no other transaction changes', async () => {
  const { readFileSync } = await import('node:fs')
  const original = readFileSync('supabase/client_crm_foundation_migration.sql','utf8')
  const migration = readFileSync('supabase/migrations/20261029003131_crm_automatic_lead_stages.sql','utf8')
  const extract=s=>{ const start=s.indexOf('CREATE OR REPLACE FUNCTION sync_client_crm_opportunity('); return s.slice(start,s.indexOf('$$;',start)+3) }
  assert.equal(extract(migration),extract(original).replace("CASE WHEN p_booking_id IS NOT NULL THEN 'qualified' ELSE 'new' END", "'new'").replace("stage = CASE WHEN p_booking_id IS NOT NULL AND stage IN ('new', 'contacted') THEN 'qualified' ELSE stage END", "stage = stage"))
})
