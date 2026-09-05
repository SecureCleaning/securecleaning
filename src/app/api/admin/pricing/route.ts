import { NextRequest, NextResponse } from 'next/server'
import { getQuotePricingConfig, saveQuotePricingConfig } from '@/lib/pricing'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

const MAX_PRICING_PAYLOAD_BYTES = 128 * 1024

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getQuotePricingConfig()
  return NextResponse.json({ config })
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, MAX_PRICING_PAYLOAD_BYTES)
  if (blocked) return blocked

  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    const config = (body as { config?: unknown } | null)?.config

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Invalid pricing config.' }, { status: 400 })
    }

    const savedConfig = await saveQuotePricingConfig(config as Parameters<typeof saveQuotePricingConfig>[0])
    return NextResponse.json({ config: savedConfig })
  } catch (error) {
    console.error('[api/admin/pricing] Failed to save pricing config:', error)
    return NextResponse.json({ error: 'Failed to save pricing config.' }, { status: 500 })
  }
}
