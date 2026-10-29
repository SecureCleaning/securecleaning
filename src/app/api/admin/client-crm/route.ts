import { getPremisesCatalog, savePremisesOption } from '@/lib/premisesCatalogServer'
import { previewLeadCsv, importLeadCsv, exportLeadCsv } from '@/lib/clientLeadCsvServer'
import { leadCsv, normalizeExcludedLeadCsvRows } from '@/lib/clientLeadCsv'
import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { getCrmFollowUps, getCrmSentEmail } from '@/lib/clientCrmReads'
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
import { previewClientCrmEmail, sendClientCrmEmail } from '@/lib/clientCrmEmail'
import { createCrmInspectionAppointment } from '@/lib/clientCrmAppointments'
import { createCrmQuoteDraft } from '@/lib/clientCrmQuotes'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { closeOpportunityWonAndCreateProduct, ContractProductError } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Client CRM access required.' }, { status: 403 })
  try {
    if (request.nextUrl.searchParams.has('premises')) return NextResponse.json({ success: true, options: await getPremisesCatalog() })
    if (request.nextUrl.searchParams.has('csv')) {
      const csv = request.nextUrl.searchParams.get('csv') === 'template' ? leadCsv([]) : await exportLeadCsv(actor)
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=client-leads.csv', 'Cache-Control': 'no-store' } })
    }
    if (request.nextUrl.searchParams.get('followUps') === '1') return NextResponse.json({ success: true, ...(await getCrmFollowUps(actor)) })
    const emailId = request.nextUrl.searchParams.get('emailId')
    if (emailId) return NextResponse.json({ success: true, email: await getCrmSentEmail(actor, request.nextUrl.searchParams.get('opportunity') || '', emailId) })
    const notesFor = request.nextUrl.searchParams.get('notesFor')
    if (notesFor) {
      return NextResponse.json({
        success: true,
        ...(await getCrmOpportunityNotes(actor, notesFor, request.nextUrl.searchParams.get('before'))),
      })
    }
    return NextResponse.json({ success: true, ...(await getClientCrmWorkspace(actor, request.nextUrl.searchParams.get('followUps') === '1', request.nextUrl.searchParams.get('opportunity') || '')) })
  } catch (error) {
    if (error instanceof ClientCrmError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[api/admin/client-crm] Failed to load workspace:', error)
    return NextResponse.json({ success: false, error: 'Unable to load the client CRM.' }, { status: 500 })
  }
}
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 1024 * 1024)
  if (blocked) return blocked
  const actor = await getClientCrmActor(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Client CRM access required.' }, { status: 403 })

  try {
    const body = await request.json() as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    if (action === 'premises.save') return NextResponse.json({ success: true, result: await savePremisesOption(actor, body) })
    if (action === 'csv.preview' || action === 'csv.import') {
      const limited = await rateLimit(request, { key: `client-csv:${actor.id}`, limit: 10, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      if (typeof body.csv !== 'string') throw new ClientCrmError('Choose a CSV file.')
      let excludedRows: number[] = []
      try { excludedRows = normalizeExcludedLeadCsvRows(body.excludedRows) } catch (error) { throw new ClientCrmError((error as Error).message) }
      return NextResponse.json({ success: true, result: action === 'csv.preview' ? await previewLeadCsv(actor, body.csv) : await importLeadCsv(actor, body.csv, excludedRows) })
    }
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
      const limited = await rateLimit(request, { key: `client-crm-note:${actor.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await addCrmOpportunityNote(actor, body) }, { status: 201 })
    }
    if (action === 'inspection.create') {
      const limited = await rateLimit(request, { key: `client-crm-inspection:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await createCrmInspectionAppointment(actor, body) }, { status: 201 })
    }
    if (action === 'quote.create') {
      const limited = await rateLimit(request, { key: `client-crm-quote:${actor.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await createCrmQuoteDraft(actor, body) }, { status: 201 })
    }
    if (action === 'opportunity.close-won') {
      const productActor = await getContractProductActor(request)
      if (!productActor) return NextResponse.json({ success: false, error: 'Contract product access required.' }, { status: 403 })
      return NextResponse.json({ success: true, result: await closeOpportunityWonAndCreateProduct(productActor, body) })
    }
    if (action === 'template.save') {
      return NextResponse.json({ success: true, result: await saveCrmTemplate(actor, body) })
    }
    if (action === 'email.preview') {
      const limited = await rateLimit(request, { key: `client-crm-preview:${actor.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
      if (limited) return limited
      return NextResponse.json({ success: true, result: await previewClientCrmEmail(actor, body) })
    }
    if (action === 'email.send') {
      const limited = await rateLimit(request, { key: `client-crm-send:${actor.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
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

