import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE city_type AS ENUM('sydney','melbourne');
CREATE TABLE clients(id uuid);
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,stage text DEFAULT 'new',closed_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE TABLE crm_communications(id serial PRIMARY KEY,opportunity_id uuid,status text,sent_at timestamptz);
CREATE TABLE bookings(id serial PRIMARY KEY,opportunity_id uuid,status text,inspection_status text,inspection_scheduled_for timestamptz);
CREATE TABLE quotes(id uuid PRIMARY KEY,final_quote_sent_at timestamptz,firm_quote_workflow jsonb DEFAULT '{}');
CREATE TABLE crm_opportunity_quotes(opportunity_id uuid,quote_id uuid,link_source text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
`)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
for(let n=1;n<=8;n++) await db.query('INSERT INTO crm_opportunities(id,stage,closed_at) VALUES($1,$2,$3)',[id(n),n===3?'won':n===4?'lost':n===5?'cancelled':'new',n>=3&&n<=5?new Date():null])
await db.query("INSERT INTO crm_communications(opportunity_id,status,sent_at) VALUES($1,'sent',now()),($2,'unknown',null)",[id(1),id(2)])
await db.exec(readFileSync('supabase/migrations/20261029003131_crm_automatic_lead_stages.sql','utf8'))
const stage=async n=>(await db.query('SELECT stage FROM crm_opportunities WHERE id=$1',[id(n)])).rows[0].stage
assert.equal(await stage(1),'contacted'); assert.equal(await stage(2),'new')
await db.query("INSERT INTO crm_communications(opportunity_id,status,sent_at) VALUES($1,'rejected',null),($1,'sending',null)",[id(2)])
assert.equal(await stage(2),'new')
await db.query("UPDATE crm_communications SET status='sent',sent_at=now() WHERE opportunity_id=$1 AND status='sending'",[id(2)])
assert.equal(await stage(2),'contacted')
await db.query("INSERT INTO bookings(opportunity_id,status,inspection_status,inspection_scheduled_for) VALUES($1,'pending','scheduled',now())",[id(2)])
assert.equal(await stage(2),'inspection')
await db.query("INSERT INTO quotes(id) VALUES($1)",[id(20)])
await db.query("INSERT INTO crm_opportunity_quotes VALUES($1,$2,'online_quote')",[id(6),id(20)])
assert.equal(await stage(6),'new','inbound instant estimate is not staff contact or a prepared quote')
await db.query("UPDATE quotes SET firm_quote_workflow='{"+'"status":"draft"'+"}' WHERE id=$1",[id(20)])
assert.equal(await stage(6),'quoting')
await db.query('UPDATE quotes SET final_quote_sent_at=now() WHERE id=$1',[id(20)])
assert.equal(await stage(6),'proposal_sent')
await db.query("INSERT INTO crm_communications(opportunity_id,status,sent_at) VALUES($1,'sent',now())",[id(6)])
await db.query("INSERT INTO bookings(opportunity_id,status,inspection_status,inspection_scheduled_for) VALUES($1,'pending','scheduled',now())",[id(6)])
assert.equal(await stage(6),'proposal_sent','later outreach/inspection must not downgrade sent quote')
await db.query('UPDATE quotes SET final_quote_sent_at=NULL WHERE id=$1',[id(20)])
assert.equal(await stage(6),'proposal_sent','revising does not erase sent history')
await db.query('INSERT INTO quotes(id) VALUES($1)',[id(21)])
await db.query("INSERT INTO crm_opportunity_quotes VALUES($1,$2,'crm_manual')",[id(7),id(21)])
assert.equal(await stage(7),'quoting')
for(const n of [3,4,5]) {
 const before=await stage(n)
 await db.query("INSERT INTO crm_communications(opportunity_id,status,sent_at) VALUES($1,'sent',now())",[id(n)])
 await db.query("SELECT advance_crm_lead_stage($1,'proposal_sent','test')",[id(n)])
 assert.equal(await stage(n),before)
}
const before=(await db.query('SELECT count(*)::int n FROM admin_audit_log')).rows[0].n
await db.query("SELECT advance_crm_lead_stage($1,'proposal_sent','retry')",[id(6)])
assert.equal((await db.query('SELECT count(*)::int n FROM admin_audit_log')).rows[0].n,before)
await assert.rejects(db.query("SELECT advance_crm_lead_stage($1,'won','test')",[id(8)]),/Invalid automatic/)
for(const role of ['anon','authenticated']) {
 await db.exec(`SET ROLE ${role}`)
 await assert.rejects(db.query("SELECT advance_crm_lead_stage($1,'contacted','test')",[id(8)]),/permission denied/)
 await db.exec('RESET ROLE')
}
await db.exec('SET ROLE service_role')
await db.query("INSERT INTO crm_communications(opportunity_id,status,sent_at) VALUES($1,'sent',now())",[id(8)])
assert.equal(await stage(8),'contacted')
await db.exec('RESET ROLE')
await db.close()
console.log('PASS stage event triggers, backfill, forward-only updates, closed protection, audit and roles')
