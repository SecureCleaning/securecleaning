import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getQuoteRoomTypeConfig, saveQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getQuoteRoomTypeConfig()
  return NextResponse.json({ config })
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const config = body?.config

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Invalid room type config.' }, { status: 400 })
    }

    const savedConfig = await saveQuoteRoomTypeConfig(config)
    return NextResponse.json({ config: savedConfig })
  } catch (error) {
    console.error('[api/admin/room-types] Failed to save room type config:', error)
    return NextResponse.json({ error: 'Failed to save room type config.' }, { status: 500 })
  }
}
