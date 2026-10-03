
const accounts = new Map()
export function testAccountResponse(url) {
  if (!String(url).includes('/admin_staff_accounts?')) return null
  const id = new URL(url).searchParams.get('id')?.replace(/^eq\./, '')
  return new Response(JSON.stringify(accounts.get(id) ?? null), { headers: { 'Content-Type': 'application/json' } })
}
export async function mintTestSession(identity) {
  const account = { ...identity, active: true }
  accounts.set(identity.id, account)
  const previous = globalThis.fetch
  globalThis.fetch = async url => testAccountResponse(url) ?? (() => { throw new Error('Unexpected token issuance request') })()
  const { createAdminSessionToken } = await import('../src/lib/adminAuth.ts')
  try { return await createAdminSessionToken(identity) } finally { globalThis.fetch = previous }
}
export function installTestAccounts() {
  globalThis.fetch = async url => testAccountResponse(url) ?? (() => { throw new Error('Unexpected fixture request: ' + new URL(url).pathname) })()
}
