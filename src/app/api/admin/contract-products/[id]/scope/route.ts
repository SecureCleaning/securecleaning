import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError, getContractProductCleanerScope } from '@/lib/contractProducts'
import { renderContractProductScopeDocument } from '@/lib/contractProductScopeDocument'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
  const actor = await getContractProductActor(request)
  if (!actor) return new NextResponse('Sign in as an admin or agent to view this cleaner scope.', { status: 403, headers })
  try {
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Product not found.', { status: 404, headers })
    const { productCode, scope } = await getContractProductCleanerScope(actor, id)
    const nonce = randomBytes(18).toString('base64')
    return new NextResponse(renderContractProductScopeDocument(productCode, scope, nonce), {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` },
    })
  } catch (error) {
    if (error instanceof ContractProductError) return new NextResponse(error.status === 409 ? 'This saved scope cannot be safely shared. Ask an administrator to review the product scope for missing content or customer details.' : error.message, { status: error.status, headers })
    console.error('[contract-product-scope] Unable to load scope')
    return new NextResponse('Unable to load the cleaner scope. Please try again.', { status: 500, headers })
  }
}
