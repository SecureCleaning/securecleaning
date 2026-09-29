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
const migration=readFileSync(new URL('../../supabase/contract_sale_start_eligibility_repair_migration.sql',import.meta.url),'utf8')
await db.exec(migration);await db.exec(migration)
assert.equal((await db.query('SELECT complete_contract_sale_handover() value')).rows[0].value,'retain newer handover')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const agent=id(1),other=id(2),cleaner=id(3),client=id(4),opportunity=id(5)
await db.query("INSERT INTO admin_staff_accounts VALUES($1,true,'agent'),($2,true,'agent')",[agent,other])
await db.query("INSERT INTO cleaners VALUES($1,'approved','NSW','not_checked')",[cleaner])
await db.query('INSERT INTO clients VALUES($1)',[client])
await db.query('INSERT INTO crm_opportunities VALUES($1,$2,NULL)',[opportunity,client])
const product=async(n,state='NSW',price=100000)=>db.query("INSERT INTO contract_products(id,status,state,assigned_staff_id,purchase_price_ex_gst_cents,opportunity_id) VALUES($1,'available',$2,$3,$4,$5)",[id(n),state,agent,price,opportunity])
const start=async(n,actor=agent,role='agent',state='NSW',who=cleaner)=>(await db.query('SELECT create_contract_product_sale($1,$2,$3,$4,$5) id',[id(n),who,actor,role,state])).rows[0].id
await product(10)
const sale=await start(10)
assert.equal(await start(10),sale)
assert.equal((await db.query('SELECT status FROM contract_products WHERE id=$1',[id(10)])).rows[0].status,'reserved')
assert.equal((await db.query('SELECT * FROM contract_product_sales')).rows.length,1)
await product(11)
await assert.rejects(start(11,other),/Product not found/)
await assert.rejects(start(11,agent,'owner'),/not authorized/)
await assert.rejects(start(11,agent,'agent','VIC'),/Product not found/)
await db.query("UPDATE cleaners SET status='pending_approval' WHERE id=$1",[cleaner])
await assert.rejects(start(11),/must be approved/)
assert.equal((await db.query('SELECT status FROM contract_products WHERE id=$1',[id(11)])).rows[0].status,'available')
await db.query("UPDATE cleaners SET status='approved',state='VIC' WHERE id=$1",[cleaner])
await assert.rejects(start(11),/product state/)
await db.query("UPDATE cleaners SET state='NSW',compliance_status='current' WHERE id=$1",[cleaner])
await start(11)
await product(12,'NSW',40000)
await assert.rejects(start(12),/greater than the \$500 deposit/)
await db.exec('SET ROLE anon')
await assert.rejects(start(12),/permission denied/)
await db.exec('RESET ROLE')
console.log('PASS: approved unchecked cleaner starts sale; current cleaner succeeds; repeat is idempotent; unapproved, wrong-state, wrong-agent, impersonated-role and low-price requests fail; handover preserved; migration repeatable.')
await db.close()
