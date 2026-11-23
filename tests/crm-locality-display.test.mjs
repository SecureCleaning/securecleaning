import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
const { getClientCrmWorkspace } = await import('../src/lib/clientCrmData.ts')

test('owner and agent workspaces recover intake locality only before a site is linked', async () => {
  const original = global.fetch
  const requests = []
  const tables = {
    crm_opportunities: [
      { id: 'provisional', primary_contact_id: 'contact', site_id: null },
      { id: 'linked', primary_contact_id: 'contact', site_id: 'site' },
      { id: 'cleared', primary_contact_id: 'contact', site_id: 'blank-site' },
      { id: 'missing', primary_contact_id: 'contact', site_id: null },
    ],
    clients: [{ id: 'contact', contact_name: 'Synthetic client', city: 'melbourne' }],
    sites: [{ id: 'site', address: 'Current address', suburb: 'Current suburb', postcode: '3000', city: 'melbourne' }, { id: 'blank-site', address: '', suburb: null, postcode: '', city: 'melbourne' }],
    crm_opportunity_intakes: ['provisional', 'linked', 'cleared'].map(id => ({ opportunity_id: id, lead_id: 'intake' })),
    leads: [{ id: 'intake', source: 'manual', address: '', suburb: 'Ryde', postcode: '2112', city: 'sydney' }],
  }
  global.fetch = async (url, options) => {
    const parsed = new URL(String(url))
    requests.push(parsed)
    assert.ok(!options?.method || options.method === 'GET', 'workspace must be read-only')
    const table = parsed.pathname.split('/').at(-1)
    let result = tables[table] ?? []
    if (table === 'availability_private_config') result = { content: JSON.stringify({ assignees: [], weeklySlots: [] }) }
    // Project selected columns, so a missing locality column is a real regression.
    if (Array.isArray(result)) result = result.map(row => Object.fromEntries(parsed.searchParams.get('select').split(',').filter(key => key in row).map(key => [key, row[key]])))
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    for (const role of ['owner', 'agent']) {
      const result = await getClientCrmWorkspace({ id: 'actor', role })
      const [provisional, linked, cleared, missing] = result.opportunities
      assert.deepEqual([provisional.suburb, provisional.postcode, provisional.city, provisional.state, provisional.siteId], ['Ryde', '2112', 'sydney', 'NSW', null])
      assert.deepEqual([linked.address, linked.suburb, linked.postcode], ['Current address', 'Current suburb', '3000'])
      assert.deepEqual([cleared.address, cleared.suburb, cleared.postcode], ['', '', ''])
      assert.deepEqual([missing.suburb, missing.postcode, missing.city], ['', '', 'melbourne'])
    }
    assert.ok(requests.some(url => url.pathname.endsWith('/crm_opportunities') && url.searchParams.get('assigned_staff_id') === 'eq.actor'))
    assert.ok(requests.filter(url => url.pathname.endsWith('/leads')).every(url => url.searchParams.get('id') === 'in.(intake)'))
  } finally { global.fetch = original }
})
