import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
CREATE TABLE partner_booking_companies(id uuid PRIMARY KEY,name text,active boolean,cities text[],expires_at timestamptz);
CREATE TABLE partner_booking_users(id uuid PRIMARY KEY,company_id uuid,display_name text,active boolean,session_version uuid);
CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_ref text,action text,details jsonb);
CREATE TABLE crm_email_suppressions(email_normalized text,blocks_all boolean);
`)
// Use the existing cleaner schema as well as the actual new migration.
const cleanerSchema = readFileSync('supabase/cleaners_migration.sql','utf8')
await db.exec(cleanerSchema.slice(0,cleanerSchema.indexOf('ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;')))
// Exercise the actual existing unsubscribe table/function, not a simulated opt-out.
const broadcastSchema=readFileSync('supabase/contract_products_migration.sql','utf8')
await db.exec(broadcastSchema.slice(broadcastSchema.indexOf('ALTER TABLE cleaners'),broadcastSchema.indexOf('CREATE TABLE IF NOT EXISTS cleaner_broadcast_campaigns')))
await db.exec(broadcastSchema.slice(broadcastSchema.indexOf('CREATE OR REPLACE FUNCTION unsubscribe_cleaner_broadcast('),broadcastSchema.indexOf('CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_recipient(')))
await db.exec(`ALTER TABLE cleaner_emails ADD COLUMN delivery_outcome text;
ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;`)
const migration=readFileSync('supabase/migrations/20261108013312_partner_cleaner_lead_intake.sql','utf8')
await db.exec(migration); await db.exec(migration)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const company=id(1),user=id(2),version=id(3),other=id(4)
await db.query(`INSERT INTO partner_booking_companies VALUES($1,'Fixture Partner',true,ARRAY['melbourne'],NULL);`,[company])
await db.query(`INSERT INTO partner_booking_users VALUES($1,$2,'Fixture Caller',true,$3),($4,$2,'Other Caller',true,$3)`,[user,company,version,other])
const base={city:'melbourne',state:'VIC',businessName:'Fixture Cleaner',firstName:'Manager',lastName:'',email:'fixture@example.test',phone:'0400000000',suburb:'Melbourne',postcode:'3000',notes:'Private call notes',emailConsent:true}
const reserve=async(n,updates={},actor=user,hash='a'.repeat(64),session=version)=> (await db.query('SELECT create_partner_cleaner_intake($1,$2,$3,$4,$5,$6) result',[actor,session,id(n),hash,JSON.stringify({...base,...updates}),['Melbourne + 20 km']])).rows[0].result
const claim=async(n,actor=user,session=version)=>(await db.query("SELECT claim_partner_cleaner_email($1,$2,$3,'Complete your cleaner details','Private profile link sent; expires in 48 hours.') result",[id(n),actor,session])).rows[0].result
const row=async(n)=>(await db.query('SELECT * FROM partner_cleaner_intakes WHERE id=$1',[id(n)])).rows[0]
await db.exec('SET ROLE service_role')
assert.deepEqual(await reserve(10),{created:true,emailStatus:'queued'})
const first=await row(10), before=(await db.query('SELECT * FROM cleaners WHERE id=$1',[first.cleaner_id])).rows[0]
// Upgrade a database with an existing intake; replays and saved records stay intact.
await db.exec('RESET ROLE')
const addressMigration=readFileSync('supabase/migrations/20261109032635_partner_cleaner_optional_address.sql','utf8')
await db.exec(addressMigration); await db.exec(addressMigration)
await db.exec('SET ROLE service_role')
assert.deepEqual((await db.query('SELECT * FROM cleaners WHERE id=$1',[first.cleaner_id])).rows[0],before)
assert.equal(before.status,'lead');assert.equal(before.compliance_status,'not_checked');assert.deepEqual(before.service_areas,['Melbourne + 20 km'])
assert.equal(before.first_name,'Manager');assert.equal(before.notes,null)
assert.match((await db.query('SELECT comment FROM cleaner_comments WHERE cleaner_id=$1',[first.cleaner_id])).rows[0].comment,/Private call notes/)
assert.deepEqual(await reserve(10),{created:false,emailStatus:'queued'})
await assert.rejects(reserve(10,{},other),/conflict/)
await assert.rejects(reserve(10,{},user,'b'.repeat(64)),/conflict/)
assert.equal(await claim(10,other),null)
const claimed=await claim(10)
assert.equal(claimed.cleanerId,first.cleaner_id);assert.equal(claimed.email,'fixture@example.test')
assert.equal(await claim(10),null)
await db.query("SELECT complete_partner_cleaner_email($1,'sent','provider-fixture')",[id(10)])
assert.equal((await row(10)).email_status,'sent')
assert.equal((await db.query('SELECT status FROM cleaner_emails WHERE id=$1',[(await row(10)).email_id])).rows[0].status,'sent')
assert.deepEqual(await reserve(10),{created:false,emailStatus:'sent'})
await assert.rejects(db.query("SELECT complete_partner_cleaner_email($1,'sent','duplicate')",[id(10)]),/Unclaimed/)
assert.deepEqual(await reserve(11,{businessName:'Attempt overwrite',address:'Wrong duplicate address',notes:'Different',email:'fixture@example.test'}),{created:true,emailStatus:'review_required'})
assert.deepEqual((await db.query('SELECT * FROM cleaners WHERE id=$1',[first.cleaner_id])).rows[0],before)
assert.equal(await claim(11),null)
assert.equal((await db.query('SELECT count(*) count FROM cleaner_emails')).rows[0].count,1)
console.log('PASS atomic creation, lead status, private notes, durable consent, replay/collision, one send claim, duplicate review without overwrite.')

for(const [n,changes] of [[12,{emailConsent:false}],[13,{state:'NSW'}],[14,{city:'sydney',state:'NSW'}],[15,{businessName:''}]]) await assert.rejects(reserve(n,changes),/Invalid|revoked/)
await assert.rejects(reserve(16,{},user,'a'.repeat(64),id(999)),/revoked/)
await db.query('UPDATE partner_booking_companies SET active=false WHERE id=$1',[company]);await assert.rejects(reserve(17),/revoked/)
await db.query("UPDATE partner_booking_companies SET active=true,expires_at=now()-interval '1 minute' WHERE id=$1",[company]);await assert.rejects(reserve(17),/revoked/)
await db.query('UPDATE partner_booking_companies SET expires_at=NULL WHERE id=$1',[company])
for(const [n,type] of [[20,'suppressed'],[21,'changed-email'],[22,'changed-state'],[23,'changed-status'],[24,'revoked-session'],[25,'revoked-state']]) {
 const email=`fixture${n}@example.test`; await reserve(n,{email})
 const intake=await row(n)
 if(type==='suppressed')await db.query('INSERT INTO crm_email_suppressions VALUES($1,true)',[email])
 if(type==='changed-email')await db.query("UPDATE cleaners SET email='changed@example.test' WHERE id=$1",[intake.cleaner_id])
 if(type==='changed-state')await db.query("UPDATE cleaners SET state='NSW' WHERE id=$1",[intake.cleaner_id])
 if(type==='changed-status')await db.query("UPDATE cleaners SET status='rejected' WHERE id=$1",[intake.cleaner_id])
 if(type==='revoked-state')await db.query("UPDATE partner_booking_companies SET cities='{}' WHERE id=$1",[company])
 assert.equal(await claim(n,user,type==='revoked-session'?id(999):version),null,type)
 assert.equal((await row(n)).email_status,'skipped',type)
 if(type==='revoked-state')await db.query("UPDATE partner_booking_companies SET cities=ARRAY['melbourne'] WHERE id=$1",[company])
}
await db.query("INSERT INTO crm_email_suppressions VALUES('optout@example.test',true)")
assert.equal((await reserve(26,{email:'optout@example.test'})).emailStatus,'skipped');assert.equal(await claim(26),null)
console.log('PASS consent, matching state, revoked/expired access, recipient/status changes, existing email suppressions.')
await reserve(27,{email:'unsubscribe@example.test'})
const unsubscribeCleaner=(await row(27)).cleaner_id
const unsubscribeToken=(await db.query('SELECT broadcast_unsubscribe_token FROM cleaners WHERE id=$1',[unsubscribeCleaner])).rows[0].broadcast_unsubscribe_token
assert.ok(unsubscribeToken)
for(let n=0;n<2;n++) assert.equal((await db.query('SELECT unsubscribe_cleaner_broadcast($1) ok',[unsubscribeToken])).rows[0].ok,true)
assert.equal((await db.query('SELECT unsubscribe_cleaner_broadcast($1) ok',[id(999)])).rows[0].ok,false)
const suppression=(await db.query('SELECT * FROM cleaner_broadcast_suppressions WHERE cleaner_id=$1',[unsubscribeCleaner])).rows[0]
assert.equal(suppression.email_normalized,'unsubscribe@example.test');assert.equal(suppression.reason,'unsubscribed')
assert.equal(await claim(27),null);assert.equal((await row(27)).email_status,'skipped')
assert.equal((await reserve(28,{email:'unsubscribe@example.test'})).emailStatus,'review_required')
assert.equal(await claim(28),null)
assert.equal((await db.query('SELECT status FROM cleaners WHERE id=$1',[unsubscribeCleaner])).rows[0].status,'lead')
assert.ok((await db.query("SELECT id FROM admin_audit_log WHERE entity_ref=$1 AND action='cleaner.broadcast.unsubscribed'",[unsubscribeCleaner])).rows.length)
console.log('PASS actual unsubscribe capability, repeat opt-out, invalid-token rejection, audit history, dispatch suppression and no duplicate resend.')
for(const [n,fields,expected] of [[32,{address:'  Unit 2, 10 Example Street  '},'Unit 2, 10 Example Street'],[33,{},null],[34,{address:'  '},null]]) {
 await reserve(n,{email:`address${n}@example.test`,...fields})
 assert.equal((await db.query('SELECT address FROM cleaners WHERE id=$1',[(await row(n)).cleaner_id])).rows[0].address,expected)
}
await assert.rejects(reserve(35,{email:'oversized@example.test',address:'a'.repeat(241)}),/Invalid/)
console.log('PASS optional address saved, omitted/blank address accepted, excessive length rejected, earlier intakes and duplicate records preserved.')
for(const [n,outcome] of [[30,'failed'],[31,'unknown']]) {
 await reserve(n,{email:`outcome${n}@example.test`});await claim(n)
 await db.query('SELECT complete_partner_cleaner_email($1,$2,NULL)',[id(n),outcome])
 assert.equal((await row(n)).email_status,outcome)
 assert.equal(await claim(n),null)
 assert.equal((await db.query('SELECT status FROM cleaners WHERE id=$1',[(await row(n)).cleaner_id])).rows[0].status,'lead')
}
await db.exec('RESET ROLE')
for(const role of ['anon','authenticated']) {
 await db.exec(`SET ROLE ${role}`)
 await assert.rejects(db.query('SELECT * FROM partner_cleaner_intakes'),/permission denied/)
 await assert.rejects(reserve(100),/permission denied/)
 await assert.rejects(claim(10),/permission denied/)
 await assert.rejects(db.query("SELECT complete_partner_cleaner_email($1,'sent','x')",[id(10)]),/permission denied/)
 await db.exec('RESET ROLE')
}
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='partner_cleaner_intakes'")).rows[0].relrowsecurity,true)
await db.exec('SET ROLE service_role')
for(let n=100;n<130;n++) {
 const count=Number((await db.query('SELECT count(*) count FROM partner_cleaner_intakes WHERE user_id=$1',[user])).rows[0].count)
 if(count===30){await assert.rejects(reserve(n,{email:`limit${n}@example.test`}),/limit/);break}
 await reserve(n,{email:`limit${n}@example.test`})
}
// Existing cleaner deletion remains possible; intake history does not cascade into other records.
await db.query('DELETE FROM cleaners WHERE id=$1',[first.cleaner_id])
assert.equal((await row(10)).cleaner_id,null)
assert.equal((await row(11)).cleaner_id,null)
console.log('PASS failed/uncertain deliveries keep lead and cannot resend, RLS/execute grants, hourly limit, deletion compatibility and repeatable migration.')
await db.close()
