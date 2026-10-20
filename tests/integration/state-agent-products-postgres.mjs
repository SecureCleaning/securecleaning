import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite }=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,active boolean,role text);
CREATE TABLE contract_products(id uuid PRIMARY KEY,status text,state text,assigned_staff_id uuid,purchase_price_ex_gst_cents integer,opportunity_id uuid,source_quote_id uuid,reserved_at timestamptz,updated_at timestamptz);
CREATE TABLE cleaners(id uuid PRIMARY KEY,status text,state text,compliance_status text);
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,primary_contact_id uuid,site_id uuid);
CREATE TABLE clients(id uuid PRIMARY KEY);
CREATE TABLE sites(id uuid PRIMARY KEY);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,sale_code text,product_id uuid,cleaner_id uuid,opportunity_id uuid,source_quote_id uuid,site_id uuid,assigned_staff_id uuid,status text,agreed_purchase_price_inc_gst_cents int,product_snapshot jsonb,cleaner_snapshot jsonb,client_snapshot jsonb,site_snapshot jsonb,created_by_staff_id uuid,updated_by_staff_id uuid);
CREATE UNIQUE INDEX one_active_sale ON contract_product_sales(product_id) WHERE status<>'cancelled';
CREATE TABLE contract_product_interests(product_id uuid,cleaner_id uuid,status text,updated_at timestamptz);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE SEQUENCE contract_sale_code_seq;
CREATE FUNCTION complete_contract_sale_handover() RETURNS text LANGUAGE sql AS $$ SELECT 'retain newer handover'::text $$;
`)
await db.exec(`
ALTER TABLE admin_staff_accounts ADD COLUMN availability_assignee_id text;
CREATE TABLE availability_private_config(key text,content text);
CREATE TABLE contract_sale_invoices(id uuid);
CREATE TABLE contract_sale_payments(id uuid);
ALTER TABLE contract_product_sales ADD COLUMN handover_at timestamptz;
ALTER TABLE contract_product_sales ADD COLUMN deposit_inc_gst_cents integer DEFAULT 50000;
ALTER TABLE contract_product_sales ADD COLUMN commencement_date date;
ALTER TABLE contract_product_sales ADD COLUMN internal_notes text;
ALTER TABLE contract_product_sales ADD COLUMN price_finalised_at timestamptz;
ALTER TABLE contract_product_sales ADD COLUMN price_finalised_by_staff_id uuid;
ALTER TABLE contract_product_sales ADD COLUMN updated_at timestamptz;
ALTER TABLE contract_sale_invoices ADD COLUMN sale_id uuid;
ALTER TABLE contract_sale_invoices ADD COLUMN status text;
CREATE TABLE contract_sale_agreements(sale_id uuid,status text);
`)
const migration=readFileSync(new URL('../../supabase/migrations/20261020071815_state_agent_product_access.sql',import.meta.url),'utf8')
await db.exec(migration);await db.exec(migration)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const agent=id(1),other=id(2),victorian=id(6),inactive=id(7),cleaner=id(3),client=id(4),opportunity=id(5)
await db.query("INSERT INTO admin_staff_accounts VALUES($1,true,'agent','nsw1'),($2,true,'agent','nsw2'),($3,true,'agent','vic'),($4,false,'agent','nsw1')",[agent,other,victorian,inactive])
await db.query('INSERT INTO availability_private_config VALUES($1,$2)',['availability.config',JSON.stringify({assignees:[{id:'nsw1',active:true,city:'sydney'},{id:'nsw2',active:true,city:'sydney'},{id:'vic',active:true,city:'melbourne'}]})])
await db.query("INSERT INTO cleaners VALUES($1,'approved','NSW','not_checked')",[cleaner])
await db.query('INSERT INTO clients VALUES($1)',[client])
await db.query('INSERT INTO crm_opportunities VALUES($1,$2,NULL)',[opportunity,client])
await db.query("INSERT INTO contract_products(id,status,state,assigned_staff_id,purchase_price_ex_gst_cents,opportunity_id) VALUES($1,'available','NSW',$2,100000,$3)",[id(10),agent,opportunity])
const start=async(actor=other,state='NSW',role='agent')=>(await db.query('SELECT create_contract_product_sale($1,$2,$3,$4,$5) id',[id(10),cleaner,actor,role,state])).rows[0].id
await assert.rejects(start(victorian),/Product not found/)
await assert.rejects(start(inactive),/not authorized/)
await assert.rejects(start(other,'VIC'),/Product not found/)
await assert.rejects(start(other,'NSW','owner'),/not authorized/)
const sale=await start()
assert.equal(await start(),sale)
const row=(await db.query('SELECT * FROM contract_product_sales')).rows[0]
assert.equal(row.assigned_staff_id,agent)
assert.equal(row.created_by_staff_id,other)
assert.equal((await db.query('SELECT status FROM contract_products')).rows[0].status,'reserved')
await db.query('SELECT update_contract_sale_overview($1,120000,NULL,$2,$3,$4,$5)',[sale,'Test',other,'agent','NSW'])
await assert.rejects(db.query('SELECT update_contract_sale_overview($1,130000,NULL,$2,$3,$4,$5)',[sale,'Test',victorian,'agent','NSW']),/Sale not found/)
await db.exec('SET ROLE anon')
await assert.rejects(start(),/permission denied/)
await db.exec('RESET ROLE')
console.log('PASS: migration replay, second NSW agent creates/updates sale, original attribution retained, VIC spoofed state/inactive/role mismatch/anonymous denied, sale reservation and idempotency retained.')
await db.close()
