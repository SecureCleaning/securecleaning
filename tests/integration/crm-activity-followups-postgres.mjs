// Synthetic PostgreSQL only. PGLITE_MODULE=/path/to/pglite/dist/index.js node this-file
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sql = s => db.exec(s)
const query = (s, p = []) => db.query(s, p)
const opportunity = async (n, due = '2026-10-01T22:00:00Z', stage = 'contacted') => query('INSERT INTO crm_opportunities(id,next_follow_up_at,stage,closed_at) VALUES($1,$2,$3,$4)', [id(n), due, stage, ['won','lost','cancelled'].includes(stage) ? '2026-10-01T00:00:00Z' : null])
const record = async n => (await query('SELECT * FROM crm_opportunities WHERE id=$1', [id(n)])).rows[0]
const iso = value => value == null ? null : new Date(value).toISOString()
const due = async n => iso((await record(n)).next_follow_up_at)
const booking = async (n, opp, start = '2026-11-04T23:00:00Z', status = 'scheduled') => query(`INSERT INTO bookings(id,opportunity_id,inspection_scheduled_for,inspection_status,status,created_at,inputs) VALUES($1,$2,$3,$4,'pending','2026-11-04T03:54:00Z','{"city":"sydney"}')`, [id(n), id(opp), start, status])
const quote = async (n, opp, sent = null) => {
 await query(`INSERT INTO quotes(id,inputs,final_quote_sent_at) VALUES($1,'{"city":"sydney"}',$2)`, [id(n), sent])
 await query(`INSERT INTO crm_opportunity_quotes(opportunity_id,quote_id,link_source) VALUES($1,$2,'crm_manual')`, [id(opp), id(n)])
}
await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TYPE city_type AS ENUM('sydney','melbourne','brisbane');
CREATE TABLE clients(id uuid);
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,stage text,closed_at timestamptz,next_follow_up_at timestamptz,updated_at timestamptz DEFAULT now(),assigned_staff_id uuid,notes text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE crm_communications(id uuid PRIMARY KEY,opportunity_id uuid,status text,sent_at timestamptz,follow_up_to_id uuid,follow_up_quote_send_id uuid);
CREATE TABLE crm_email_templates(id uuid);
CREATE TABLE crm_email_template_versions(id uuid);
CREATE TABLE bookings(id uuid PRIMARY KEY,opportunity_id uuid,status text,inspection_status text,inspection_scheduled_for timestamptz,inputs jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE quotes(id uuid PRIMARY KEY,final_quote_sent_at timestamptz,firm_quote_workflow jsonb DEFAULT '{}',inputs jsonb);
CREATE TABLE crm_opportunity_quotes(opportunity_id uuid,quote_id uuid,link_source text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
await sql(readFileSync('supabase/client_crm_followups_migration.sql', 'utf8'))
await sql(readFileSync('supabase/migrations/20261029003131_crm_automatic_lead_stages.sql', 'utf8'))
// Existing Dixon-like records; no production writes.
for (let n = 1; n <= 7; n++) await opportunity(n, n === 4 ? null : n === 7 ? '2026-11-15T22:00:00Z' : '2026-11-04T22:00:00Z', n === 5 ? 'won' : 'contacted')
for (const n of [1,3,4,5,6,7]) await booking(100 + n, n)
await quote(102, 2, '2026-11-04T23:00:00Z')
await query(`INSERT INTO admin_audit_log VALUES('crm_opportunity',$1,'crm.follow_up.changed','{}','2026-11-04T04:00:00Z')`, [id(3)])
await query(`INSERT INTO crm_communications(id,opportunity_id,status,sent_at) VALUES($1,$2,'sent','2026-11-04T04:00:00Z')`, [id(106), id(6)])
await sql(readFileSync('supabase/migrations/20261105020935_crm_activity_follow_up_schedule.sql', 'utf8'))
assert.equal(await due(1), '2026-11-08T22:00:00.000Z', 'Thursday inspection -> Monday 9 am Sydney')
assert.equal(await due(2), '2026-11-08T22:00:00.000Z', 'sent quote repairs stale reminder')
assert.equal((await record(1)).follow_up_source, 'inspection')
for (const n of [3,5,6]) assert.equal(await due(n), '2026-11-04T22:00:00.000Z', 'preserve later manual/email or closed cycle')
assert.equal(await due(4), null, 'do not revive completed reminder during backfill')
assert.equal(await due(7), '2026-11-15T22:00:00.000Z', 'keep existing post-inspection reminder')
await quote(180, 3, '2026-11-04T03:00:00Z')
assert.equal(await due(3), '2026-11-04T22:00:00.000Z', 'late pre-rollout quote respects recorded later manual reminder')

// New confirmed appointments, pending partner requests, rescheduling and no-op saves.
await opportunity(10)
await booking(110, 10, null, 'pending')
assert.equal(await due(10), '2026-10-01T22:00:00.000Z', 'TBA requests are not confirmed inspections')
await query(`UPDATE bookings SET inspection_status='scheduled',inspection_scheduled_for='2026-11-05T23:00:00Z' WHERE id=$1`, [id(110)])
assert.equal(await due(10), '2026-11-09T22:00:00.000Z', 'Friday confirmed -> Tuesday follow-up')
assert.equal((await record(10)).stage, 'inspection')
const initial = await record(10)
await query(`UPDATE bookings SET status='completed',inspection_scheduled_for=inspection_scheduled_for WHERE id=$1`, [id(110)])
assert.equal(iso((await record(10)).follow_up_event_at), iso(initial.follow_up_event_at), 'ordinary updates do not reset reminder')
await query(`UPDATE bookings SET inspection_scheduled_for='2026-11-09T23:00:00Z' WHERE id=$1`, [id(110)])
assert.equal(await due(10), '2026-11-11T22:00:00.000Z', 'reschedule uses new inspection date')
// Manual completion survives booking retries; a real subsequent appointment creates new work.
await query('UPDATE crm_opportunities SET next_follow_up_at=NULL WHERE id=$1', [id(10)])
await query('UPDATE bookings SET inspection_scheduled_for=inspection_scheduled_for WHERE id=$1', [id(110)])
assert.equal(await due(10), null)
await booking(111, 10, '2026-11-11T23:00:00Z')
assert.equal(await due(10), '2026-11-15T22:00:00.000Z')
await query(`UPDATE bookings SET inspection_status='cancelled' WHERE id=$1`, [id(111)])
assert.equal((await record(10)).follow_up_source, 'inspection_cancelled')

// Booking created before CRM linking receives the same reminder once linked.
await opportunity(11)
await query(`INSERT INTO bookings(id,status,inspection_status,inspection_scheduled_for,inputs) VALUES($1,'pending','scheduled','2026-11-04T23:00:00Z','{"city":"sydney"}')`, [id(112)])
await query('UPDATE bookings SET opportunity_id=$1 WHERE id=$2', [id(11), id(112)])
assert.equal(await due(11), '2026-11-08T22:00:00.000Z')

// Success-only quote sends, revisions and retry idempotency.
await opportunity(12)
await quote(120, 12)
assert.equal(await due(12), '2026-10-01T22:00:00.000Z', 'preparing a draft does not advance follow-up')
await query(`UPDATE quotes SET final_quote_sent_at='2026-11-05T01:00:00Z' WHERE id=$1`, [id(120)])
assert.equal(await due(12), '2026-11-08T22:00:00.000Z')
assert.equal((await record(12)).follow_up_source, 'quote')
const quoteBefore = await record(12)
await query('UPDATE quotes SET final_quote_sent_at=final_quote_sent_at WHERE id=$1', [id(120)])
assert.deepEqual(await record(12), quoteBefore)
await query('UPDATE quotes SET final_quote_sent_at=NULL WHERE id=$1', [id(120)])
assert.equal(await due(12), '2026-11-08T22:00:00.000Z', 'revising a document preserves the existing reminder')
await query(`UPDATE quotes SET final_quote_sent_at='2026-11-09T01:00:00Z' WHERE id=$1`, [id(120)])
assert.equal(await due(12), '2026-11-10T22:00:00.000Z', 'new sent version advances reminder')
await opportunity(13)
await quote(130, 13, '2026-11-05T01:00:00Z')
assert.equal(await due(13), '2026-11-08T22:00:00.000Z', 'linking an already-sent quote also works')
await opportunity(16)
await booking(160, 16, new Date(Date.now() + 30 * 86400000).toISOString())
const futureInspectionDue = await due(16)
await quote(161, 16, new Date(Date.now() + 1000).toISOString())
assert.equal(await due(16), futureInspectionDue, 'quote sent before a future inspection does not bring its reminder before the visit')

// Email follow-ups keep their explicit date. Unrelated/failed sends do nothing.
await opportunity(14)
await query(`INSERT INTO crm_communications(id,opportunity_id,status,follow_up_at,sent_at) VALUES($1,$2,'sending','2026-11-12T22:00:00Z','2026-11-04T01:00:00Z')`, [id(140), id(14)])
await query(`UPDATE crm_communications SET status='rejected' WHERE id=$1`, [id(140)])
assert.equal(await due(14), '2026-10-01T22:00:00.000Z')
await query(`UPDATE crm_communications SET status='sent' WHERE id=$1`, [id(140)])
assert.equal(await due(14), '2026-11-12T22:00:00.000Z')
assert.equal((await record(14)).follow_up_source, 'email')
await booking(141, 14)
const inspectionDue = await due(14)
await query(`INSERT INTO crm_communications(id,opportunity_id,status,follow_up_to_id,sent_at) VALUES($1,$2,'sending',$3,'2026-11-04T02:00:00Z')`, [id(142), id(14), id(140)])
await query(`UPDATE crm_communications SET status='sent' WHERE id=$1`, [id(142)])
assert.equal(await due(14), inspectionDue, 'late old email must not clear post-inspection reminder')
await query(`UPDATE crm_opportunities SET next_follow_up_at='2026-11-17T22:00:00Z' WHERE id=$1`, [id(14)])
assert.equal((await record(14)).follow_up_source, 'manual')
await quote(143, 14, '2026-11-04T02:00:00Z')
assert.equal(await due(14), '2026-11-17T22:00:00.000Z', 'late quote cannot overwrite newer manual change')
await query(`INSERT INTO crm_communications(id,opportunity_id,status,sent_at) VALUES($1,$2,'sending',clock_timestamp())`, [id(144), id(14)])
await query(`UPDATE crm_communications SET status='sent' WHERE id=$1`, [id(144)])
assert.equal(await due(14), '2026-11-17T22:00:00.000Z', 'ordinary email without reminder leaves it alone')
await query(`INSERT INTO crm_communications(id,opportunity_id,status,follow_up_to_id,sent_at) VALUES($1,$2,'sending',$3,clock_timestamp())`, [id(145), id(14), id(140)])
await query(`UPDATE crm_communications SET status='sent' WHERE id=$1`, [id(145)])
assert.equal(await due(14), null, 'new successful follow-up can explicitly complete reminder')

for (const [n, stage] of [[20,'won'],[21,'lost'],[22,'cancelled']]) {
 await opportunity(n, null, stage); await booking(n + 200, n); await quote(n + 300, n, '2026-11-05T01:00:00Z')
 assert.equal(await due(n), null); assert.equal((await record(n)).stage, stage)
}
// Australian local 9am across DST, weekends, year boundaries and Queensland.
const scenarios = [
 ['2026-10-01T23:00:00Z','melbourne','2026-10-05T22:00:00.000Z'],
 ['2026-10-01T23:00:00Z','brisbane','2026-10-05T23:00:00.000Z'],
 ['2026-04-02T23:00:00Z','sydney','2026-04-06T23:00:00.000Z'],
 ['2026-12-30T23:00:00Z','sydney','2027-01-03T22:00:00.000Z'],
]
for (const [anchor, city, expected] of scenarios) assert.equal(iso((await query('SELECT crm_follow_up_due($1,$2) due', [anchor,city])).rows[0].due), expected)
assert.ok((await query(`SELECT 1 FROM admin_audit_log WHERE action='crm.follow_up.changed' AND details->>'source'='inspection' AND details->>'sourceId'=$1`, [id(101)])).rows.length)
for (const role of ['anon','authenticated']) {
 await sql(`SET ROLE ${role}`)
 await assert.rejects(query('SELECT set_crm_activity_follow_up($1,$2,$3,now(),now())',[id(14),'quote',id(143)]), /permission denied/)
 await sql('RESET ROLE')
}
await sql('SET ROLE service_role')
await opportunity(30); await booking(330, 30)
assert.equal(await due(30), '2026-11-08T22:00:00.000Z')
await sql('RESET ROLE')
await db.close()
console.log('PASS CRM reminder backfill, booking/partner confirmation/reschedule, quote sends, manual edits, late deliveries, closed cycles, timezone, audit and role protections')
