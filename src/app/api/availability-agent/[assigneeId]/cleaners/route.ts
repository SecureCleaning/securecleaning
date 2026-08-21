import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { createCleanerForState, getCleanerTemplates, searchAgentCleanerPage } from '@/lib/cleaners'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

export async function GET(request: NextRequest, { params }: { params: { assigneeId: string } }) {
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1')
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? '50')
  const [result, templates] = await Promise.all([
    searchAgentCleanerPage({
      query: request.nextUrl.searchParams.get('query') ?? '',
      state: context.state,
      status: request.nextUrl.searchParams.get('status') ?? 'all',
      service: request.nextUrl.searchParams.get('service') ?? 'all',
      compliance: request.nextUrl.searchParams.get('compliance') ?? 'all',
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    }),
    getCleanerTemplates(),
  ])

  return NextResponse.json({ success: true, state: context.state, templates, ...result })
}

export async function POST(request: NextRequest, { params }: { params: { assigneeId: string } }) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-create:${context.assignee.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const cleaner = await createCleanerForState(await request.json(), context.state, context.actor)
    return NextResponse.json({ success: true, cleaner })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to create cleaner.' }, { status: 400 })
  }
}
