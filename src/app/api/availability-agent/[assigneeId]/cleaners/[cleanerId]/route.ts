import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { getCleanerDetailForState } from '@/lib/cleaners'

export async function GET(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const detail = await getCleanerDetailForState(params.cleanerId, context.state)
    return NextResponse.json({ success: true, ...detail })
  } catch {
    return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
  }
}
