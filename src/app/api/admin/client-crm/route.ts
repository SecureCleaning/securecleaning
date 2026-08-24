import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import {
  ClientCrmError,
  createManualCrmLead,
  getClientCrmWorkspace,
  saveCrmTemplate,
  updateCrmLead,
} from '@/lib/clientCrmData'
import { sendClientCrmEmail } from '@/lib/clientCrmEmail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Client CRM access required.' }, { status: 403 })
  try {
    return NextResponse.json({ success: true, ...(await getClientCrmWorkspace(actor)) })
  } catch (error) {
    console.error('[api/admin/client-crm] Failed to load workspace:', error)
    return NextResponse.json({ success: false, error: 'Unable to load the client CRM.' }, { status: 500 })
  }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 24 * 1024)
  if (blocked) return blocked
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Client CRM access required.' }, { status: 403 })

  try {
    const body = await request.json() as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    if (action === 'lead.create') {
      const result = await createManualCrmLead(actor, body)
      return NextResponse.json({ success: true, result }, { status: 201 })
    }
    if (action === 'lead.update') {
      return NextResponse.json({ success: true, result: await updateCrmLead(actor, body) })
    }
    if (action === 'template.save') {
      return NextResponse.json({ success: true, result: await saveCrmTemplate(actor, body) })
    }
    if (action === 'email.send') {
      const limited = rateLimit(request, { key: `client-crm-send:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await sendClientCrmEmail(actor, body) })
    }
    return NextResponse.json({ success: false, error: 'Select a valid Client CRM action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof ClientCrmError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[api/admin/client-crm] Operation failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to complete the Client CRM operation.' }, { status: 500 })
  }
}
