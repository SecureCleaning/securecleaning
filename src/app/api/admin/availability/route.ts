import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilityConfig, saveAvailabilityConfig } from '@/lib/availability'

function isAuthorized(request: NextRequest) {
  const password = request.headers.get('x-admin-password')
  const expectedPassword = process.env.CONTENT_ADMIN_PASSWORD

  return Boolean(expectedPassword && password && password === expectedPassword)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getAvailabilityConfig()
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
      return NextResponse.json({ error: 'Invalid availability config.' }, { status: 400 })
    }

    const savedConfig = await saveAvailabilityConfig(config)
    return NextResponse.json({ config: savedConfig })
  } catch (error) {
    console.error('[api/admin/availability] Failed to save availability config:', error)
    return NextResponse.json({ error: 'Failed to save availability config.' }, { status: 500 })
  }
}
