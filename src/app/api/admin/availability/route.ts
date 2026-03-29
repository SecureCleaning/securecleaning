import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilityConfig, saveAvailabilityConfig } from '@/lib/availability'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getAvailabilityConfig()
  return NextResponse.json({ config })
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
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
