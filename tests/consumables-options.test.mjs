import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConsumableVariants, calculateConsumablePriceCents } from '../src/lib/consumablesShared.ts'
import { parseSupplierProduct, supplierUrl, fetchSupplier } from '../src/lib/consumablesSupplier.ts'
import { parseConsumablesImportFile } from '../src/lib/consumablesImport.ts'

const url = 'https://sydneycleaningsupplies.com.au/shop/bags-liners/example/'
const option = { label: '18L', packSize: '1000 per carton', supplierSku: 'KTSB', supplierCostCents: 3000, finalPriceOverrideCents: null }
const html = `<h1 class="product_title">Test liners</h1><p class="price">$30.00 ex. GST</p><div class="woocommerce-product-details__short-description">18L 540 x 450mm (1000 per carton)</div><form data-product_variations="[{&quot;attributes&quot;:{&quot;size&quot;:&quot;18l-small&quot;},&quot;display_price&quot;:30,&quot;sku&quot;:&quot;KTSB&quot;}]"></form><img data-large_image="https://sydneycleaningsupplies.com.au/wp-content/uploads/liner.jpg">`

test('each size calculates independently, with zero and explicit overrides preserved', () => {
  assert.deepEqual([3000,3500,4000].map(cost => calculateConsumablePriceCents(cost,2000)), [3600,4200,4800])
  assert.equal(calculateConsumablePriceCents(3500,2000,0),3500)
  assert.equal(calculateConsumablePriceCents(3500,2000,null,3995),3995)
  assert.equal(parseConsumableVariants([option])[0].supplierCostCents,3000)
  assert.throws(()=>parseConsumableVariants([option,{...option,label:'18l'}]), /unique/)
  assert.throws(()=>parseConsumableVariants([{...option,supplierCostCents:-1}]), /prices/)
  assert.throws(()=>parseConsumableVariants([{...option,finalPriceOverrideCents:1.5}]), /prices/)
  assert.throws(()=>parseConsumableVariants([{...option,packSize:''}]), /pack/)
})

test('supplier preview reads options and current sale price, requiring ex-GST evidence', () => {
  const parsed = parseSupplierProduct(html,url)
  assert.equal(parsed.variants.length,1)
  assert.equal(parsed.variants[0].supplierSku,'KTSB')
  assert.equal(parsed.variants[0].supplierCostCents,3000)
  assert.equal(parsed.variants[0].packSize,'1000 per carton')
  const simple = '<h1 class="product_title">73L Bags *250/CARTON*</h1><p class="price">Original price was: $35.00. Current price is: $30.00. ex. GST</p><span class="sku">LDBIN73H</span>'
  assert.equal(parseSupplierProduct(simple,url).supplierCostCents,3000)
  assert.equal(parseSupplierProduct(simple,url).packSize,'250 per carton')
  assert.throws(()=>parseSupplierProduct(simple.replace('ex. GST','inc GST'),url),/GST/)
})

test('supplier URLs cannot target internal hosts, arbitrary sites, credentials or non-product paths', () => {
  for (const candidate of ['http://sydneycleaningsupplies.com.au/shop/a','https://127.0.0.1/shop/a','https://sydneycleaningsupplies.com.au.evil.test/shop/a','https://user:pass@sydneycleaningsupplies.com.au/shop/a','https://sydneycleaningsupplies.com.au:444/shop/a','https://sydneycleaningsupplies.com.au/wp-admin/']) assert.throws(()=>supplierUrl(candidate))
  assert.throws(()=>supplierUrl(url,true))
})

test('supplier fetch rejects oversized responses and redirects are disabled', async () => {
  const original=global.fetch
  try {
    global.fetch=async (input,init)=> { assert.equal(init.redirect,'error'); return new Response('<h1>test</h1>',{headers:{'content-type':'text/html'}}) }
    assert.equal((await fetchSupplier(url)).bytes.toString(),'<h1>test</h1>')
    global.fetch=async()=>new Response('x'.repeat(3*1024*1024+1),{headers:{'content-type':'text/html'}})
    await assert.rejects(fetchSupplier(url),/large/)
  } finally {global.fetch=original}
})

test('CSV carries options and omission remains distinguishable for old imports', async () => {
  const encoded=JSON.stringify([option]).replaceAll('"','""')
  const file=new File([`Title,Description,Pack size,Supplier cost,Options JSON\nLiners,Test,1000,30,"${encoded}"`],'test.csv')
  const result=await parseConsumablesImportFile(file)
  assert.deepEqual(result.products[0].variants,[option])
  const old=await parseConsumablesImportFile(new File(['Title,Description,Pack size,Supplier cost\nLiners,Test,1000,30'],'old.csv'))
  assert.equal(old.products[0].variants,undefined)
})

test('public catalogue strips supplier costs, SKUs and overrides from every option', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic'
  process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic'
  const {getPublicConsumablesCatalog}=await import('../src/lib/consumables.ts')
  const original=global.fetch
  try {
    global.fetch=async (input)=> {
      const path=new URL(String(input)).pathname
      if(path.endsWith('/consumable_catalog_settings')) return new Response(JSON.stringify({default_markup_bps:2000,prices_exclude_gst:true}),{headers:{'content-type':'application/json'}})
      assert.ok(path.endsWith('/consumable_products'))
      return new Response(JSON.stringify([{id:'synthetic',title:'Liners',description:'test',pack_size:'1000',supplier_cost_cents:3000,supplier_sku:'private',variants:[option]}]),{headers:{'content-type':'application/json'}})
    }
    const catalog=await getPublicConsumablesCatalog()
    assert.deepEqual(catalog.products[0].variants,[{label:'18L',packSize:'1000 per carton',priceCents:3600}])
    assert.doesNotMatch(JSON.stringify(catalog),/supplier|markup|Override|KTSB/)
  } finally {global.fetch=original}
})

test('saving an older product payload and importing an older CSV preserve existing options', async () => {
  const {saveConsumableProduct,importConsumableProducts}=await import('../src/lib/consumables.ts')
  const stored={id:'synthetic',slug:'liners',title:'Liners',description:'test',pack_size:'1000',supplier_cost_cents:3000,variants:[option]}
  const original=global.fetch
  const writes=[]
  try {
    global.fetch=async(input,init)=> {
      const path=new URL(String(input)).pathname
      if(path.endsWith('/consumable_catalog_settings')) return new Response(JSON.stringify({default_markup_bps:2000}),{headers:{'content-type':'application/json'}})
      if(path.includes('/storage/')) return new Response(JSON.stringify({id:'fixture'}),{headers:{'content-type':'application/json'}})
      if(path.endsWith('/admin_audit_log')) return new Response(null,{status:201})
      assert.ok(path.endsWith('/consumable_products'))
      if((init?.method??'GET')==='POST') {
        const body=JSON.parse(init.body); writes.push(body)
        return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})
      }
      return new Response(JSON.stringify([stored]),{headers:{'content-type':'application/json'}})
    }
    const payload={id:'synthetic',title:'Liners',slug:'liners',description:'test',packSize:'1000',supplierCostCents:3000}
    await saveConsumableProduct(payload,'test-manager')
    assert.deepEqual(writes[0].variants,[option])
    await importConsumableProducts([payload],'test-manager')
    assert.deepEqual(writes[1][0].variants,[option])
  } finally {global.fetch=original}
})
