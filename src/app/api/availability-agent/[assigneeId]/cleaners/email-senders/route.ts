import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { getCleanerEmailSenders } from '@/lib/cleanerEmailSenders'
export async function GET(request: NextRequest, props: { params: Promise<{ assigneeId: string }> }) {
  const { assigneeId } = await props.params
  const context = await getCleanerAgentContext(request, assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json({ success: true, ...await getCleanerEmailSenders(context.actor, context.state) }) }
  catch { return NextResponse.json({ success: false, error: 'Link this regional agent to one active Team Access account with an email signature.' }, { status: 400 }) }
}
