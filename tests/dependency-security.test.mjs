import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const braces = createRequire(require.resolve('micromatch'))('braces')

test('hardened braces retains normal glob, range and escaped-pattern behavior', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/file{1..3}.ts'), ['src/app/file1.ts','src/app/file2.ts','src/app/file3.ts','src/lib/file1.ts','src/lib/file2.ts','src/lib/file3.ts'])
  assert.equal(braces.compile('a/{b,c}/d'), 'a/(b|c)/d')
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d')
  assert.deepEqual(braces.expand('a/\\{b,c\\}/d'), ['a/{b,c}/d'])
  assert.deepEqual(require('micromatch')(['src/app/a.ts','src/lib/b.ts','test/a.js'], 'src/{app,lib}/*.ts'), ['src/app/a.ts','src/lib/b.ts'])
})

test('hardened braces bounds nested patterns on every public parser/walker', () => {
  for (const pattern of ['{'.repeat(4000)+'x'+ '}'.repeat(4000), '('.repeat(4000)+'x'+')'.repeat(4000), '{'.repeat(4000)]) {
    for (const fn of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => fn(pattern), { name: 'SyntaxError', message: /safe traversal limits/ })
    }
  }
})

test('hardened braces rejects deep and cyclic caller-provided ASTs before recursion', () => {
  let ast = { type: 'text', value: 'x' }
  for (let i=0;i<10000;i++) ast = { type:'root', nodes:[ast] }
  const cycle = { type:'root', nodes:[] }; cycle.nodes.push(cycle)
  for (const fn of [braces.compile, braces.expand, braces.stringify]) {
    for (const input of [ast,cycle]) assert.throws(() => fn(input), { name:'SyntaxError', message:/safe traversal limits/ })
  }
})

test('ExcelJS export/import retains UUID-backed conditional formatting', async () => {
  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Security regression')
  sheet.addRow(['Amount', 42])
  sheet.addConditionalFormatting({ref:'B1:B1',rules:[{type:'dataBar',minLength:0,maxLength:100,cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF008800'}}]})
  const bytes = await workbook.xlsx.writeBuffer()
  const restored = new ExcelJS.Workbook()
  await restored.xlsx.load(bytes)
  assert.equal(restored.worksheets[0].getCell('B1').value,42)
  assert.equal(restored.worksheets[0].conditionalFormattings[0].rules[0].type,'dataBar')
})

test('Google API multipart requests retain UUID boundaries without contacting Google', async () => {
  const {google} = require('googleapis')
  let captured = ''
  const response = await google.drive('v3').files.create({ requestBody:{name:'synthetic.txt'},media:{mimeType:'text/plain',body:'synthetic content'} }, {
    adapter: async config => {
      for await (const chunk of config.body) captured += chunk.toString()
      return {status:200,statusText:'OK',headers:{},data:{id:'synthetic-id'},config}
    },
  })
  assert.equal(response.data.id,'synthetic-id')
  assert.match(captured,/synthetic content/)
  assert.match(captured,/synthetic.txt/)
  assert.match(captured,/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/)
})

test('installed local security package matches the reviewable vendor source', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const installed = dirname(createRequire(require.resolve('micromatch')).resolve('braces'))
  for (const name of ['index.js', ...readdirSync(new URL('../vendor/braces/lib/', import.meta.url)).map(name => 'lib/' + name)]) {
    assert.equal(readFileSync(join(installed,name),'utf8'),readFileSync(new URL('../vendor/braces/'+name,import.meta.url),'utf8'),name)
  }
})
