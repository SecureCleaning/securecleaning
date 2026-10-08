// Run after npm run build: node tests/integration/consumables-packaged-smoke.mjs
// Exercises the compiled POST and its ExcelJS worker using only NFT-traced files.
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ExcelJS from 'exceljs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const route = '.next/server/app/api/admin/consumables/import/route.js'
const trace = JSON.parse(await readFile(join(root, `${route}.nft.json`), 'utf8'))
const isolated = await mkdtemp(join(tmpdir(), 'securecleaning-packaged-import-'))
try {
  const files = new Set([route, ...trace.files.map(file => relative(root, resolve(root, dirname(route), file)))])
  for (const file of files) {
    assert.ok(!file.startsWith('..') && !file.startsWith('/'), 'Trace file escaped repository')
    const destination = join(isolated, file)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(root, file), destination, { dereference: true })
  }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Synthetic products')
  sheet.addRow(['Title', 'Supplier cost', 'Markup %'])
  sheet.addRow(['Synthetic packaged import', 12.5, 20])
  await writeFile(join(isolated, 'synthetic.xlsx'), Buffer.from(await workbook.xlsx.writeBuffer()))
  await writeFile(join(isolated, 'smoke.cjs'), `
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const account = { id: '00000000-0000-4000-8000-000000000001', username: 'synthetic-manager', role: 'manager', active: true, session_version: 'synthetic-v1', password_hash: 'synthetic-not-a-password', legacy_password_hash: null, availability_assignee_id: null };
let reads = 0;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  assert.equal(url.pathname, '/rest/v1/admin_staff_accounts', 'Unexpected outbound request blocked');
  assert.equal((init?.method ?? 'GET').toUpperCase(), 'GET', 'Mutations blocked');
  assert.equal(url.searchParams.get('id'), 'eq.' + account.id);
  reads++;
  return new Response(JSON.stringify(account), { headers: { 'content-type': 'application/json' } });
};
const hmac = value => createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(value).digest('base64url');
const rev = hmac(JSON.stringify([account.session_version, account.username, account.password_hash, account.legacy_password_hash, account.role, account.active, account.availability_assignee_id]));
const payload = Buffer.from(JSON.stringify({ v: 3, rev, sub: account.id, username: account.username, role: account.role, exp: Math.floor(Date.now()/1000)+60 })).toString('base64url');
const token = payload + '.' + hmac(payload);
const { routeModule } = require('./${route}');
// The compiled handler uses standard Request methods plus these NextRequest properties.
// No additional source-tree Next modules are copied into the deployment trace.
function request(bytes, authenticated = true) {
  const data = new FormData(); data.set('file', new File([bytes], 'synthetic.xlsx'));
  const req = new Request('https://fixture.invalid/api/admin/consumables/import', { method: 'POST', headers: { origin: 'https://fixture.invalid' }, body: data });
  req.nextUrl = new URL(req.url);
  req.cookies = { get: name => authenticated && name === 'securecleaning_admin_session' ? { value: token } : undefined };
  return req;
}
(async () => {
  const bytes = readFileSync('synthetic.xlsx');
  const packagedExcel = require('exceljs');
  const dependencyProbe = new packagedExcel.Workbook();
  await dependencyProbe.xlsx.load(bytes);
  const success = await routeModule.userland.POST(request(bytes));
  const result = await success.json();
  assert.equal(success.status, 200, JSON.stringify(result));
  assert.equal(result.success, true);
  assert.equal(result.preview.products.length, 1);
  assert.equal(result.preview.products[0].title, 'Synthetic packaged import');
  assert.equal(result.preview.products[0].supplierCostCents, 1250);
  assert.equal(result.preview.products[0].markupOverrideBps, 2000);
  const malformed = await routeModule.userland.POST(request(Buffer.from('not a workbook')));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).success, false);
  const denied = await routeModule.userland.POST(request(bytes, false));
  assert.equal(denied.status, 403);
  assert.equal(reads, 2);
  console.log(JSON.stringify({ compiledPost: 'passed', tracedFiles: ${files.size}, xlsxWorker: 'passed', syntheticProductCostCents: 1250, malformedWorkbook: 400, unauthenticated: 403, mockedAccountReads: reads, networkRequests: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
`)
  const run = spawnSync(process.execPath, ['smoke.cjs'], {
    cwd: isolated, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', ADMIN_SESSION_SECRET: 'synthetic-packaged-test-secret', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key' },
  })
  process.stdout.write(run.stdout ?? '')
  process.stderr.write(run.stderr ?? '')
  assert.equal(run.status, 0, run.error?.message ?? 'Packaged route smoke failed')
} finally {
  await rm(isolated, { recursive: true, force: true })
}
