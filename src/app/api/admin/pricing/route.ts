import { NextRequest, NextResponse } from 'next/server'
import { getQuotePricingConfig, saveQuotePricingConfig } from '@/lib/pricing'

function isAuthorized(request: NextRequest) {
  const password = request.headers.get('x-admin-password')
  const expectedPassword = process.env.CONTENT_ADMIN_PASSWORD

  return Boolean(expectedPassword && password && password === expectedPassword)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getQuotePricingConfig()
  return NextResponse.json({ config })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const config = body?.config

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Invalid pricing config.' }, { status: 400 })
    }

    const savedConfig = await saveQuotePricingConfig(config)
    return NextResponse.json({ config: savedConfig })
  } catch (error) {
    console.error('[api/admin/pricing] Failed to save pricing config:', error)
    return NextResponse.json({ error: 'Failed to save pricing config.' }, { status: 500 })
  }
}
