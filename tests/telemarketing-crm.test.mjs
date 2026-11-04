import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeCrmSourceType, requiresNamedSourceProvider, buildContactSourceExplanation } from '../src/lib/clientCrmPolicy.ts'
import { filterSortCrmLeads } from '../src/lib/crmLeadList.ts'
import { parseLeadCsv } from '../src/lib/clientLeadCsv.ts'

test('telemarketing is a named source, without claiming an online enquiry', () => {
 assert.equal(normalizeCrmSourceType('telemarketing_partner'), 'telemarketing_partner')
 assert.equal(requiresNamedSourceProvider('telemarketing_partner', 'enquiry'), true)
 const text=buildContactSourceExplanation({sourceType:'telemarketing_partner',sourceProvider:'Example callers'})
 assert.match(text,/Example callers/)
 assert.doesNotMatch(text,/website|publicly listed/)
})
test('source filter finds partner contributions to existing opportunities and combines with stage/search', () => {
 const leads=[{id:'a',sourceType:'manual',telemarketingCompanies:['Example callers'],businessName:'A',stage:'contacted'}, {id:'b',businessName:'B',sourceType:'telemarketing_partner',sourceProvider:'Other callers',stage:'won'}, {id:'c',businessName:'C',sourceType:'direct_booking',stage:'contacted'}]
 assert.deepEqual(filterSortCrmLeads(leads,'','name','all','telemarketing_partner').map(l=>l.id),['a','b'])
 assert.deepEqual(filterSortCrmLeads(leads,'Example callers','updated','contacted','telemarketing_partner').map(l=>l.id),['a'])
 assert.deepEqual(filterSortCrmLeads(leads,'','updated','all','direct_booking').map(l=>l.id),['c'])
 assert.equal(leads[0].sourceType,'manual')
})
test('CSV accepts telemarketing partner and requires a company', () => {
 const header='email,postcode,city,source_type,contact_basis,source_provider\n'
 const accepted=parseLeadCsv(header+'test@example.com,2148,sydney,Telemarketing partner,Client enquiry,Example callers',[])
 assert.equal(accepted[0].record.source_type,'telemarketing_partner')
 const missing=parseLeadCsv(header+'test@example.com,2148,sydney,Telemarketing partner,Client enquiry,',[])
 assert.ok(JSON.stringify(missing).includes('Source provider is required'))
})
test('migration preserves production sync logic and derives source only from a verified partner booking', () => {
 const sql=readFileSync(new URL('../supabase/migrations/20261104015135_telemarketing_crm_source.sql',import.meta.url),'utf8')
 assert.match(sql,/r\.id=b\.partner_request_id/)
 assert.match(sql,/WHERE b\.id=p_booking_id/)
 assert.match(sql,/source_provider=partner_company WHERE id=resolved_intake_id/)
 assert.match(sql,/l\.source_reference=b\.id::text AND l\.source='direct_booking'/)
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM public\.leads other/)
 assert.match(sql,/REVOKE ALL ON FUNCTION/)
 assert.doesNotMatch(sql,/UPDATE public\.clients|UPDATE clients SET email|send_email|resend/i)
 const current=readFileSync(new URL('../supabase/migrations/20261030055403_configure_queensland_booking.sql',import.meta.url),'utf8')
 const body=current.slice(current.indexOf('CREATE OR REPLACE FUNCTION sync_client_crm_opportunity('),current.indexOf('-- Append only missing Queensland zones.'))
 const restored=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION sync_client_crm_opportunity('),sql.indexOf('\nREVOKE ALL'))
  .replace('  partner_company text;\n','')
  .replace(/  -- Derive provenance[\s\S]*?  resolved_reference := COALESCE/,'  resolved_reference := COALESCE')
  .replace(/  IF partner_company IS NOT NULL THEN\n    UPDATE leads SET source_provider=partner_company WHERE id=resolved_intake_id;\n  END IF;\n/,'')
 assert.equal(restored.trim(),body.trim())
})
