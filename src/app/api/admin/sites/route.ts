import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { createSite, getSites, updateSite } from '@/lib/sites'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sites = await getSites()
  return NextResponse.json({ success: true, sites })
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const site = await createSite(body)
    return NextResponse.json({ success: true, site })
  } catch (error) {
    console.error('[api/admin/sites] Failed to create site:', error)
    return NextResponse.json({ success: false, error: 'Failed to create site.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const siteId = typeof body?.siteId === 'string' ? body.siteId : ''
    if (!siteId) {
      return NextResponse.json({ success: false, error: 'siteId is required.' }, { status: 400 })
    }

    const site = await updateSite(siteId, body)
    return NextResponse.json({ success: true, site })
  } catch (error) {
    console.error('[api/admin/sites] Failed to update site:', error)
    return NextResponse.json({ success: false, error: 'Failed to update site.' }, { status: 500 })
  }
}
