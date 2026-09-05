import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getQuoteRoomTypeConfig, saveQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

const MAX_ROOM_TYPE_PAYLOAD_BYTES = 256 * 1024

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getQuoteRoomTypeConfig()
  return NextResponse.json({ config })
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, MAX_ROOM_TYPE_PAYLOAD_BYTES)
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
      return NextResponse.json({ error: 'Invalid room type config.' }, { status: 400 })
    }

    const savedConfig = await saveQuoteRoomTypeConfig(config as Parameters<typeof saveQuoteRoomTypeConfig>[0])
    return NextResponse.json({ config: savedConfig })
  } catch (error) {
    console.error('[api/admin/room-types] Failed to save room type config:', error)
    return NextResponse.json({ error: 'Failed to save room type config.' }, { status: 500 })
  }
}
