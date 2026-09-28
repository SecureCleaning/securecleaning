import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean,availability_assignee_id text);
CREATE TABLE quotes(id uuid PRIMARY KEY,final_quote_sent_by jsonb,final_quote_sent_at timestamptz);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,sale_code text,product_id uuid,status text,source_quote_id uuid,created_by_staff_id uuid);
CREATE TABLE contract_commission_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),win_bps integer,sale_bps integer);
CREATE TABLE contract_commission_assignments(sale_id uuid PRIMARY KEY,win_agent_id uuid,sale_agent_id uuid,win_bps integer,sale_bps integer,created_by uuid,created_at timestamptz);
CREATE TABLE contract_commission_claims(id uuid PRIMARY KEY,sale_id uuid,agent_id uuid,amount_cents integer,invoice_reference text,created_at timestamptz);
CREATE TABLE contract_commission_payouts(id uuid PRIMARY KEY,sale_id uuid,agent_id uuid,amount_cents integer,paid_on date,reference text,recorded_by uuid,created_at timestamptz);
CREATE VIEW contract_commission_balances AS SELECT a.sale_id,a.win_agent_id agent_id,0::bigint earned_cents,0::bigint claimed_cents,0::bigint paid_cents FROM contract_commission_assignments a;
CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_ref text,action text,details jsonb);
INSERT INTO contract_commission_settings VALUES(true,2500,2500);
`)
const migration = readFileSync('supabase/contract_sale_automatic_commission_assignment_migration.sql','utf8')
await db.exec(migration); await db.exec(migration)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner=id(1),winner=id(2),seller=id(3),replacement=id(4),quote=id(10),sale=id(20)
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'owner',true,NULL),($2,'agent',true,'winner-session'),($3,'agent',true,'seller-session'),($4,'agent',true,'replacement-session')`,[owner,winner,seller,replacement])
await db.query(`INSERT INTO quotes VALUES($1,$2::jsonb,now())`,[quote,JSON.stringify({kind:'staff_account',id:winner,name:'Winner'})])
await db.query(`INSERT INTO contract_product_sales VALUES($1,'PS-AUTO',$2,'draft',$3,$4)`,[sale,id(30),quote,seller])
let assignment=(await db.query('SELECT * FROM contract_commission_assignments WHERE sale_id=$1',[sale])).rows[0]
assert.equal(assignment.win_agent_id,winner);assert.equal(assignment.sale_agent_id,seller);assert.equal(assignment.win_bps,2500);assert.equal(assignment.sale_bps,2500)
assert.equal((await db.query(`SELECT count(*)::int n FROM admin_audit_log WHERE action='commission.auto_assigned'`)).rows[0].n,1)
await assert.rejects(db.query('UPDATE contract_commission_assignments SET sale_agent_id=$1 WHERE sale_id=$2',[replacement,sale]),/immutable outside/)
const action=(actor,kind,input)=>db.query('SELECT manage_contract_commission($1,$2,$3::jsonb)',[actor,kind,JSON.stringify(input)])
await action(owner,'correct',{saleId:sale,winAgentId:winner,saleAgentId:replacement})
assignment=(await db.query('SELECT * FROM contract_commission_assignments WHERE sale_id=$1',[sale])).rows[0]
assert.equal(assignment.sale_agent_id,replacement);assert.equal(assignment.win_bps,2500)
await db.query(`INSERT INTO contract_commission_claims VALUES($1,$2,$3,100,'AG-1',now())`,[id(40),sale,winner])
await assert.rejects(action(owner,'correct',{saleId:sale,winAgentId:replacement,saleAgentId:replacement}),/cannot be corrected/)
await db.query(`INSERT INTO quotes VALUES($1,$2::jsonb,now())`,[id(11),JSON.stringify({kind:'agent_session',id:'winner-session',name:'Winner'})])
await db.query(`INSERT INTO contract_product_sales VALUES($1,'PS-SESSION',$2,'draft',$3,$4)`,[id(21),id(31),id(11),seller])
assert.equal((await db.query('SELECT win_agent_id FROM contract_commission_assignments WHERE sale_id=$1',[id(21)])).rows[0].win_agent_id,winner)
await db.query(`INSERT INTO contract_product_sales VALUES($1,'PS-OWNER',$2,'draft',$3,$4)`,[id(22),id(32),quote,owner])
assert.equal((await db.query('SELECT count(*)::int n FROM contract_commission_assignments WHERE sale_id=$1',[id(22)])).rows[0].n,0)
console.log('PASS: sales auto-assign from quote sender and sale creator; owner correction is audited, rate-preserving, and closes after claims.')
await db.close()
