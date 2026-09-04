import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getClientCrmActor } from '@/lib/clientCrmAuth'
import {
  ClientCrmError,
  addCrmOpportunityNote,
  createManualCrmOpportunity,
  getCrmOpportunityNotes,
  getClientCrmWorkspace,
  saveCrmTemplate,
  updateCrmProfile,
  updateCrmOpportunity,
} from '@/lib/clientCrmData'
import { sendClientCrmEmail } from '@/lib/clientCrmEmail'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { closeOpportunityWonAndCreateProduct, ContractProductError } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Client CRM access required.' }, { status: 403 })
  try {
    const notesFor = request.nextUrl.searchParams.get('notesFor')
    if (notesFor) {
      return NextResponse.json({
        success: true,
        ...(await getCrmOpportunityNotes(actor, notesFor, request.nextUrl.searchParams.get('before'))),
      })
    }
    return NextResponse.json({ success: true, ...(await getClientCrmWorkspace(actor)) })
  } catch (error) {
    if (error instanceof ClientCrmError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
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
    if (action === 'opportunity.create') {
      const result = await createManualCrmOpportunity(actor, body)
      return NextResponse.json({ success: true, result }, { status: 201 })
    }
    if (action === 'opportunity.update') {
      return NextResponse.json({ success: true, result: await updateCrmOpportunity(actor, body) })
    }
    if (action === 'client-record.update') {
      return NextResponse.json({ success: true, result: await updateCrmProfile(actor, body) })
    }
    if (action === 'opportunity-note.add') {
      const limited = rateLimit(request, { key: `client-crm-note:${actor.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await addCrmOpportunityNote(actor, body) }, { status: 201 })
    }
    if (action === 'opportunity.close-won') {
      const productActor = await getContractProductActor(request)
      if (!productActor) return NextResponse.json({ success: false, error: 'Contract product access required.' }, { status: 403 })
      return NextResponse.json({ success: true, result: await closeOpportunityWonAndCreateProduct(productActor, body) })
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
    if (error instanceof ClientCrmError || error instanceof ContractProductError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[api/admin/client-crm] Operation failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to complete the Client CRM operation.' }, { status: 500 })
  }
}
