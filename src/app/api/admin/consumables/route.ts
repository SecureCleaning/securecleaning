import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import {
  getConsumablesAdminCatalog,
  importConsumableProducts,
  saveConsumableProduct,
  saveConsumableSettings,
} from '@/lib/consumables'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  }
  try {
    return NextResponse.json({ success: true, catalog: await getConsumablesAdminCatalog() })
  } catch (error) {
    console.error('[api/admin/consumables] Failed to load catalogue:', error)
    return NextResponse.json({ success: false, error: 'Unable to load the consumables catalogue.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })
  }
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 1024 * 1024)
  if (blocked) return blocked
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity) return NextResponse.json({ success: false, error: 'Manager access required.' }, { status: 403 })

  try {
    const body = await request.json() as { action?: unknown; settings?: unknown; product?: unknown; products?: unknown }
    if (body.action === 'settings.save') {
      return NextResponse.json({ success: true, settings: await saveConsumableSettings(body.settings, identity.id) })
    }
    if (body.action === 'product.save') {
      return NextResponse.json({ success: true, product: await saveConsumableProduct(body.product, identity.id) })
    }
    if (body.action === 'products.import') {
      return NextResponse.json({ success: true, products: await importConsumableProducts(body.products, identity.id) })
    }
    return NextResponse.json({ success: false, error: 'Unsupported catalogue action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update the consumables catalogue.'
    console.error('[api/admin/consumables] Catalogue update failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
