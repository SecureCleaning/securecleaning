// Isolated PostgreSQL-compatible fixtures only. No production connection or delivery provider.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const renata='72bddeab-8e0e-4bb2-bee4-c48cafbeede6', owner=id(1), other=id(2), cove='c08e0000-0000-4000-8000-000000000001'
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0]
const sale=async(n,opp=10,seller=owner)=>db.query(`INSERT INTO contract_product_sales(id,sale_code,status,opportunity_id,source_quote_id,created_by_staff_id) VALUES($1,$2,'draft',$3,$4,$5)`,[id(n),`PS-${n}`,id(opp),id(5),seller])
const assignment=async n=>one('SELECT * FROM contract_commission_assignments WHERE sale_id=$1',[id(n)])
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TYPE city_type AS ENUM ('sydney','melbourne','brisbane');
 CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,display_name text,active boolean,role text,availability_assignee_id text);
 CREATE TABLE quotes(id uuid PRIMARY KEY,quote_ref text,final_quote_sent_by jsonb,final_quote_sent_at timestamptz);
 CREATE TABLE quote_send_attempts(id uuid,quote_ref text,status text,actor jsonb,document_variant text,finalized_at timestamptz);
 CREATE TABLE quote_final_document_versions(quote_ref text,document_version int,sent_by jsonb,sent_at timestamptz,sent_variant text);
 CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,sale_code text,status text,opportunity_id uuid,source_quote_id uuid,created_by_staff_id uuid,product_id uuid);
 CREATE TABLE contract_commission_settings(id boolean PRIMARY KEY,win_bps int,sale_bps int);
 CREATE TABLE contract_commission_assignments(sale_id uuid PRIMARY KEY,win_agent_id uuid,sale_agent_id uuid,win_bps int,sale_bps int,created_by uuid,created_at timestamptz);
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source text,source_provider text);
 CREATE TABLE crm_opportunity_intakes(opportunity_id uuid,lead_id uuid,linked_at timestamptz DEFAULT now());
 CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,assigned_staff_id uuid,site_id uuid,cleaning_frequency text,cleaning_time_preference text);
 CREATE TABLE crm_lead_import_rows(actor_id uuid,import_key text,opportunity_id uuid);
 CREATE TABLE sites(id uuid PRIMARY KEY,premises_type text);
 CREATE TABLE contract_sale_invoices(id uuid PRIMARY KEY,sale_id uuid,total_inc_gst_cents integer,gst_component_cents integer,status text);
 CREATE TABLE contract_sale_payment_allocations(invoice_id uuid,amount_cents integer);
 CREATE TABLE contract_sale_payment_plans(id uuid PRIMARY KEY,sale_id uuid,status text);
 CREATE TABLE contract_sale_agreements(payment_plan_id uuid,status text);
 CREATE TABLE contract_commission_claims(sale_id uuid,agent_id uuid,amount_cents integer);
 CREATE TABLE contract_commission_payouts(sale_id uuid,agent_id uuid,amount_cents integer);
 INSERT INTO admin_staff_accounts VALUES('${owner}','Owner',true,'owner',null),('${renata}','Renata Mezedi',true,'agent','nsw'),('${other}','Other Agent',true,'agent','vic');
 INSERT INTO contract_commission_settings VALUES(true,2000,2000);
 INSERT INTO quotes VALUES('${id(5)}','Q-1','{"kind":"staff_account","id":"${other}"}',now());
 INSERT INTO leads VALUES('${id(10)}','manual','Cove Commercial Cleaning'),('${id(11)}','manual','Other provider');
 INSERT INTO crm_opportunities(id,assigned_staff_id) VALUES('${id(10)}','${renata}'),('${id(11)}','${other}');
 INSERT INTO crm_opportunity_intakes(opportunity_id,lead_id) VALUES('${id(10)}','${id(10)}'),('${id(11)}','${id(11)}');
 `)
 await db.exec(readFileSync('supabase/migrations/20261029215838_commission_attribution_review.sql','utf8'))
 await sale(20,10,other) // Pre-existing Cove-labelled sale already has standard locked commission.
 await sale(21,10,owner) // Pre-existing unmatched sale must not be silently backfilled.
 const original=await assignment(20)
 const beforeLeads=(await db.query('SELECT * FROM leads ORDER BY id')).rows
 const beforeSales=(await db.query('SELECT id,sale_code,status,opportunity_id,source_quote_id,created_by_staff_id FROM contract_product_sales ORDER BY id')).rows
 const beforeAudit=(await one('SELECT count(*)::int n FROM admin_audit_log')).n
 await db.exec(readFileSync('supabase/migrations/20261127010756_enquiry_source_commission_rules.sql','utf8'))
 assert.deepEqual(await assignment(20),original)
 assert.equal(await assignment(21),undefined)
 assert.deepEqual((await db.query('SELECT * FROM leads ORDER BY id')).rows,beforeLeads)
 assert.deepEqual((await db.query('SELECT id,sale_code,status,opportunity_id,source_quote_id,created_by_staff_id FROM contract_product_sales ORDER BY id')).rows,beforeSales)
 assert.equal((await one('SELECT count(*)::int n FROM admin_audit_log')).n,beforeAudit)
 assert.equal((await one('SELECT count(*)::int n FROM contract_product_sales WHERE commission_source_snapshot IS NOT NULL')).n,0)
 await sale(22) // Existing labelled enquiry, NEW sale, even owner-created with another quote sender.
 assert.equal((await assignment(22)).win_agent_id,renata)
 assert.equal((await assignment(22)).sale_agent_id,renata)
 assert.equal((await assignment(22)).win_bps,6000)
 assert.equal((await assignment(22)).sale_bps,0)
 await sale(23,11,other)
 assert.equal((await assignment(23)).win_bps,2000)
 assert.equal((await assignment(23)).sale_bps,2000)
 const ruleSave=(actor,ruleId,name,agent,bps,revision,active=true)=>db.query('SELECT save_commission_source_rule($1,$2,$3,$4,$5,$6,$7)',[actor,ruleId,name,agent,bps,active,revision])
 await assert.rejects(ruleSave(renata,cove,'Cove Commercial Cleaning',renata,5000,1),/Owner access/)
 await ruleSave(owner,cove,'Cove Commercial Cleaning',renata,5500,1)
 await assert.rejects(ruleSave(owner,cove,'Cove Commercial Cleaning',renata,5000,1),/Rule changed/)
 await assert.rejects(ruleSave(owner,cove,'Cove Commercial Cleaning',renata,10001,2),/Invalid rule/)
 assert.equal((await assignment(22)).win_bps,6000)
 await sale(24)
 assert.equal((await assignment(24)).win_bps,5500)
 await db.query(`UPDATE contract_product_sales SET status='completed' WHERE id=$1`,[id(22)])
 assert.equal((await assignment(22)).win_bps,6000)
 await assert.rejects(db.query(`UPDATE contract_product_sales SET commission_source_snapshot='{}' WHERE id=$1`,[id(22)]),/locked/)
 const snapshot=(await one('SELECT commission_source_snapshot s FROM contract_product_sales WHERE id=$1',[id(22)])).s
 assert.equal(snapshot.name,'Cove Commercial Cleaning');assert.equal(snapshot.agentBps,6000)
 // Stable IDs survive renames; new agent mapping applies only to future sales.
 await db.exec(`INSERT INTO leads VALUES('${id(12)}','referral:${cove}','Cove Commercial Cleaning'); INSERT INTO crm_opportunities(id) VALUES('${id(12)}'); INSERT INTO crm_opportunity_intakes(opportunity_id,lead_id) VALUES('${id(12)}','${id(12)}')`)
 await ruleSave(owner,cove,'Cove renamed',other,6500,2)
 await sale(25,12)
 assert.equal((await assignment(25)).win_agent_id,other)
 assert.equal((await assignment(25)).win_bps,6500)
 assert.equal((await assignment(22)).win_agent_id,renata)
 // Another configured source is independent.
 await ruleSave(owner,id(99),'Another referral',renata,4500,0)
 await assert.rejects(ruleSave(owner,id(98),'Another referral',renata,4000,0),/duplicate key/)
 // Active link lost between lead and sale: hold for review, no standard fallback.
 await db.exec(`UPDATE admin_staff_accounts SET active=false WHERE id='${other}'`)
 await sale(26,12)
 assert.equal(await assignment(26),undefined)
 assert.match((await one('SELECT review_reason FROM contract_commission_attribution_status WHERE sale_id=$1',[id(26)])).review_reason,/source commission needs review/)
 await assert.rejects(db.query(`INSERT INTO contract_commission_assignments VALUES($1,$2,$2,2000,2000,$2,now())`,[id(26),renata]),/saved enquiry-source/)
 await assert.rejects(db.query('SELECT retry_source_commission($1,$2)',[renata,id(26)]),/Owner access/)
 await db.exec(`UPDATE admin_staff_accounts SET active=true WHERE id='${other}'`)
 await db.query('SELECT retry_source_commission($1,$2)',[owner,id(26)])
 assert.equal((await assignment(26)).win_bps,6500)
 const count=(await one('SELECT count(*)::int n FROM admin_audit_log')).n
 await db.query('SELECT retry_source_commission($1,$2)',[owner,id(26)])
 assert.equal((await one('SELECT count(*)::int n FROM admin_audit_log')).n,count)
 // The actual commission view continues releasing cumulative signed-plan entitlement.
 const source=readFileSync('supabase/contract_sale_commissions_plans_migration.sql','utf8')
 await db.exec(source.slice(source.indexOf('CREATE OR REPLACE VIEW contract_commission_balances AS'),source.indexOf('CREATE OR REPLACE FUNCTION manage_contract_commission')))
 await db.exec(`INSERT INTO contract_sale_invoices VALUES('${id(60)}','${id(22)}',110000,10000,'part_paid'); INSERT INTO contract_sale_payment_allocations VALUES('${id(60)}',55000); INSERT INTO contract_sale_payment_plans VALUES('${id(61)}','${id(22)}','active'); INSERT INTO contract_sale_agreements VALUES('${id(61)}','signed')`)
 assert.equal(Number((await one('SELECT earned_cents FROM contract_commission_balances WHERE sale_id=$1',[id(22)])).earned_cents),30000)
 await db.exec(`INSERT INTO contract_sale_payment_allocations VALUES('${id(60)}',55000)`)
 assert.equal(Number((await one('SELECT earned_cents FROM contract_commission_balances WHERE sale_id=$1',[id(22)])).earned_cents),60000)
 for(const role of ['anon','authenticated']) {
  assert.equal((await one(`SELECT has_table_privilege('${role}','commission_source_rules','SELECT') ok`)).ok,false)
  assert.equal((await one(`SELECT has_function_privilege('${role}','save_commission_source_rule(uuid,uuid,text,uuid,integer,boolean,integer)','EXECUTE') ok`)).ok,false)
  assert.equal((await one(`SELECT has_function_privilege('${role}','retry_source_commission(uuid,uuid)','EXECUTE') ok`)).ok,false)
 }
 // Exercise the actual CRM wrapper with a minimal create fixture, including race-time source validation.
 const foundation=readFileSync('supabase/client_crm_foundation_migration.sql','utf8')
 const createHeader=foundation.slice(foundation.indexOf('CREATE OR REPLACE FUNCTION create_client_crm_opportunity('),foundation.indexOf('DECLARE',foundation.indexOf('CREATE OR REPLACE FUNCTION create_client_crm_opportunity(')))
 await db.exec(createHeader + `DECLARE oid uuid:=gen_random_uuid(); lid uuid; BEGIN
  INSERT INTO leads(source,source_provider) VALUES(p_source,p_source_provider) RETURNING id INTO lid;
  INSERT INTO crm_opportunities(id,assigned_staff_id) VALUES(oid,p_assigned_staff_id);
  INSERT INTO crm_opportunity_intakes(opportunity_id,lead_id) VALUES(oid,lid);
  RETURN oid; END $$;`)
 const createValues={p_actor_id:owner,p_actor_role:'owner',p_source:`referral:${cove}`,p_source_provider:'spoofed',p_assigned_staff_id:renata,p_city:'sydney'}
 const create=async(values,key=null)=>one(`SELECT save_crm_record_with_premises('create',$1::jsonb,NULL,NULL,$2) id`,[JSON.stringify(values),key])
 const created=await create(createValues,'test-replay')
 assert.equal((await one('SELECT assigned_staff_id FROM crm_opportunities WHERE id=$1',[created.id])).assigned_staff_id,other)
 assert.equal((await one('SELECT source_provider FROM leads l JOIN crm_opportunity_intakes oi ON oi.lead_id=l.id WHERE oi.opportunity_id=$1',[created.id])).source_provider,'Cove renamed')
 assert.equal((await create(createValues,'test-replay')).id,created.id)
 await assert.rejects(create({...createValues,p_actor_id:renata,p_actor_role:'agent'}),/another agent/)
 await ruleSave(owner,cove,'Cove renamed',other,6500,3,false)
 await assert.rejects(create(createValues),/active enquiry source/)
 await sale(27,12) // Hiding stops new enquiries, but honours an already-recorded referral.
 assert.equal((await assignment(27)).win_bps,6500)
 assert.deepEqual(await assignment(20),original)
 assert.deepEqual((await db.query('SELECT * FROM leads WHERE id IN ($1,$2) ORDER BY id',[id(10),id(11)])).rows,beforeLeads)
 // Service-role callers use the same grants as protected production server routes.
 await db.exec('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role')
 await db.query('SELECT retry_source_commission($1,$2)',[owner,id(26)])
 await assert.rejects(db.query('SELECT retry_source_commission($1,$2)',[renata,id(26)]),/Owner access/)
 await db.exec('RESET ROLE')
 console.log('PASS: unchanged historical records, Cove/Renata automatic60%, standard40%, future-only settings, recipient changes, stable source identity, audited owner edits, stale rejection, inactive recipient review/retry, insertion guards, progressive payments and role grants.')
} finally {await db.close()}
