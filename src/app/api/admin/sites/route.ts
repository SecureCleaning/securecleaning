import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { validateSitePayload } from '@/lib/sitePayloadValidation'
import { createSite, getSites, updateSite } from '@/lib/sites'

const MAX_SITE_PAYLOAD_BYTES = 32 * 1024

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sites = await getSites()
  return NextResponse.json({ success: true, sites })
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, MAX_SITE_PAYLOAD_BYTES)
  if (blocked) return blocked

  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 })
    }

    const validation = validateSitePayload(body, 'create')
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    const site = await createSite(validation.payload as Parameters<typeof createSite>[0])
    return NextResponse.json({ success: true, site })
  } catch (error) {
    console.error('[api/admin/sites] Failed to create site:', error)
    return NextResponse.json({ success: false, error: 'Failed to create site.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, MAX_SITE_PAYLOAD_BYTES)
  if (blocked) return blocked

  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 })
    }

    const validation = validateSitePayload(body, 'update')
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    const site = await updateSite(validation.siteId!, validation.payload)
    return NextResponse.json({ success: true, site })
  } catch (error) {
    console.error('[api/admin/sites] Failed to update site:', error)
    return NextResponse.json({ success: false, error: 'Failed to update site.' }, { status: 500 })
  }
}
