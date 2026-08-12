import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { createCleaner, deleteSampleCleaners, searchCleanerPage } from '@/lib/cleaners'

export async function GET(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'list')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  const { searchParams } = request.nextUrl
  const page = Number(searchParams.get('page') ?? '1')
  const pageSize = Number(searchParams.get('pageSize') ?? '50')
  const result = await searchCleanerPage({
    query: searchParams.get('query') ?? '',
    city: searchParams.get('city') ?? 'all',
    state: searchParams.get('state') ?? 'all',
    status: searchParams.get('status') ?? 'all',
    service: searchParams.get('service') ?? 'all',
    compliance: searchParams.get('compliance') ?? 'all',
    wwcc: searchParams.get('wwcc') ?? 'all',
    expiry: searchParams.get('expiry') ?? 'all',
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
  })

  return NextResponse.json({ success: true, ...result })
}

export async function POST(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'mutate')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const payload = await request.json()
    const cleaner = await createCleaner(payload, authorization.identity)
    return NextResponse.json({ success: true, cleaner })
  } catch (error) {
    console.error('[api/admin/cleaners] Failed to create cleaner:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create cleaner.' },
      { status: 400 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const authorization = authorizeCleanerAdminRequest(request, 'sampleDelete')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  if (request.nextUrl.searchParams.get('mode') !== 'sample-cleaners') {
    return NextResponse.json({ success: false, error: 'Unsupported cleaner delete action.' }, { status: 400 })
  }

  try {
    const deletedCount = await deleteSampleCleaners(authorization.identity)
    return NextResponse.json({ success: true, deletedCount })
  } catch (error) {
    console.error('[api/admin/cleaners] Failed to delete sample cleaners:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete sample cleaners.' },
      { status: 400 }
    )
  }
}
