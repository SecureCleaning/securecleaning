const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
const base=readFileSync('supabase/consumables_catalogue_migration.sql','utf8').split('INSERT INTO public.consumable_catalog_settings')[0].replace('BEGIN;','')
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;'+base)
await db.exec("INSERT INTO public.consumable_products(slug,title,description,pack_size,supplier_cost_cents) VALUES('existing','Existing','Synthetic','one',1234)")
await db.exec(readFileSync('supabase/migrations/20261027010530_consumable_product_options.sql','utf8'))
const rows=(await db.query('SELECT title,variants,supplier_cost_cents FROM public.consumable_products ORDER BY sort_order,title')).rows
assert.equal(rows.length,4)
assert.equal(rows.find(x=>x.title==='Existing').supplier_cost_cents,1234)
assert.equal(rows.filter(x=>x.variants.length===3).length,2)
for(const row of rows.filter(x=>x.variants.length)) assert.deepEqual(row.variants.map(x=>x.supplierCostCents),[3000,3500,4000])
await assert.rejects(db.exec("UPDATE public.consumable_products SET variants='{}'::jsonb"))
const acl=(await db.query("SELECT has_table_privilege('anon','public.consumable_products','SELECT') AS anon,has_table_privilege('authenticated','public.consumable_products','UPDATE') AS authenticated")).rows[0]
assert.deepEqual(acl,{anon:false,authenticated:false})
console.log('PASS: migration, existing row preserved, three products, six variants, malformed options blocked, browser ACL unchanged')
await db.close()
