import { NextRequest, NextResponse } from 'next/server'
import { secureTokenMatch } from '@/lib/mobileMessage'
import { runSmsWorker } from '@/lib/smsWorker'
import { deliverEmailFailureAlerts } from '@/lib/emailFailureAlerts'
export const runtime='nodejs'
export const maxDuration=60
export const dynamic='force-dynamic'
export async function POST(request:NextRequest) {
  if(!secureTokenMatch(request.headers.get('authorization')||'',`Bearer ${process.env.SMS_WORKER_SECRET||''}`)||!process.env.SMS_WORKER_SECRET) return NextResponse.json({error:'Unauthorised'},{status:401})
  // Drain owner alerts independently of whether SMS is enabled, busy or unavailable.
  const emailAlerts = deliverEmailFailureAlerts().catch(() => console.error('[email-alerts] Scheduled owner alert delivery unavailable.'))
  try {return NextResponse.json(await runSmsWorker())} catch {return NextResponse.json({error:'SMS worker unavailable; pending messages retained.'},{status:503})}
  finally {await emailAlerts}
}
