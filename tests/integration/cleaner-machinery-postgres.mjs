import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec("CREATE TABLE cleaners(id integer PRIMARY KEY); INSERT INTO cleaners VALUES(1); ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;")
await db.exec(readFileSync('supabase/migrations/20261026010000_cleaner_specialist_machinery.sql','utf8'))
assert.equal((await db.query('SELECT specialist_machinery FROM cleaners')).rows[0].specialist_machinery,null)
for(const value of [null,{items:[],other:'',notes:''},{items:['carpet_extractor','multi_wash','walk_behind_scrubber','rotary_buffer','other'],other:'Pressure washer',notes:'Owned'}]) {
 await db.query('UPDATE cleaners SET specialist_machinery=$1 WHERE id=1',[value===null?null:JSON.stringify(value)])
 assert.deepEqual((await db.query('SELECT specialist_machinery FROM cleaners')).rows[0].specialist_machinery,value)
}
for(const value of [[],{},'bad',{items:['invalid'],other:'',notes:''},{items:['other'],other:'',notes:''},{items:[null],other:'',notes:''},{items:[],other:'',notes:'x'.repeat(1001)},{items:[],other:'',notes:'',private:'bad'}]) await assert.rejects(db.query('UPDATE cleaners SET specialist_machinery=$1 WHERE id=1',[JSON.stringify(value)]),/check constraint/)
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='cleaners'")).rows[0].relrowsecurity,true)
console.log('PASS: old records remain unknown, machinery and none round-trip, invalid input blocked, RLS unchanged.')
await db.close()
