import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE crm_opportunities(id uuid primary key,stage text,next_follow_up_at timestamptz,notes text);
CREATE TABLE crm_communications(id uuid primary key,opportunity_id uuid,status text,sent_at timestamptz,follow_up_at timestamptz,follow_up_to_id uuid,follow_up_note text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
await db.exec(await fs.readFile('supabase/migrations/20261029031703_crm_follow_up_reminder_reset.sql','utf8'))
await db.exec(`CREATE TRIGGER crm_email_follow_up AFTER UPDATE OF status ON crm_communications FOR EACH ROW EXECUTE FUNCTION apply_crm_email_follow_up(); SET ROLE service_role;`)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const due='2026-10-19T00:00:00.000Z', next='2026-11-02T00:00:00.000Z'
async function scenario(n,{status='sent',follow=true,date=null,stage='contacted',newer=false}={}) {
 await db.query('insert into crm_opportunities values($1,$2,$3,$4)',[id(n),stage,due,'Keep notes'])
 await db.query('insert into crm_communications values($1,$2,$3,$4,$5,$6,$7)',[id(n),id(n),'sending','2026-10-29T03:00:00Z',date,follow?id(999):null,'Next check'])
 if(newer) await db.query('insert into crm_communications(id,opportunity_id,status,sent_at) values($1,$2,$3,$4)',[id(n+100),id(n),'sent','2026-10-30T03:00:00Z'])
 await db.query('update crm_communications set status=$1 where id=$2',[status,id(n)])
 return (await db.query('select next_follow_up_at,notes from crm_opportunities where id=$1',[id(n)])).rows[0]
}
assert.equal((await scenario(1)).next_follow_up_at,null)
assert.equal((await scenario(2,{date:next})).next_follow_up_at.toISOString(),next)
for(const [n,status] of [[3,'rejected'],[4,'unknown'],[5,'sending']]) assert.equal((await scenario(n,{status})).next_follow_up_at.toISOString(),due)
assert.equal((await scenario(6,{follow:false})).next_follow_up_at.toISOString(),due)
assert.equal((await scenario(7,{follow:false,date:next})).next_follow_up_at.toISOString(),next)
for(const [n,stage] of [[8,'won'],[9,'lost'],[10,'cancelled']]) assert.equal((await scenario(n,{stage})).next_follow_up_at.toISOString(),due)
assert.equal((await scenario(11,{newer:true,date:next})).next_follow_up_at.toISOString(),due)
await db.query('update crm_opportunities set next_follow_up_at=$1 where id=$2',[next,id(1)])
await db.query("update crm_communications set status='sent' where id=$1",[id(1)])
assert.equal((await db.query('select next_follow_up_at from crm_opportunities where id=$1',[id(1)])).rows[0].next_follow_up_at.toISOString(),next)
await db.exec('SET ROLE anon')
await assert.rejects(db.exec('select * from crm_opportunities'),/permission denied/)
await db.close()
console.log('Reminder reset passed: clear, replace, normal email preservation, failed/unknown sends, closed leads, late older finalization, retries, public denial.')
