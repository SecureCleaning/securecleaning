import { NextRequest, NextResponse } from 'next/server'
import { secureTokenMatch } from '@/lib/mobileMessage'
import { runBackgroundEmailWorker } from '@/lib/backgroundEmailWorker'
import { getAdminSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest) {
  const secret = process.env.BULK_EMAIL_WORKER_SECRET ?? ''
  return secret.length >= 32 && secureTokenMatch(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
}

// Read-only rollout/health verification; cannot claim a job or send a message.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await getAdminSupabase().rpc('background_email_worker_ready')
  const ready = !error && data === true && Boolean(process.env.RESEND_API_KEY)
  return NextResponse.json({ ready }, { status: ready ? 200 : 503 })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try { return NextResponse.json(await runBackgroundEmailWorker()) }
  catch { return NextResponse.json({ error: 'Background delivery unavailable; saved recipients retained.' }, { status: 503 }) }
}
