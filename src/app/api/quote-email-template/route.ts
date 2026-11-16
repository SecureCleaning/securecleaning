import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getContractProductActor } from '@/lib/contractProductAuth'
import { loadQuoteEmailTemplate, manageQuoteEmailTemplate } from '@/lib/quoteEmailTemplateServer'
export async function GET(request: NextRequest) {
 const actor = await getContractProductActor(request)
 if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 try { return NextResponse.json({ template: await loadQuoteEmailTemplate(), canEdit: actor.role === 'owner' || actor.role === 'manager' }, { headers: { 'Cache-Control': 'private, no-store' } }) }
 catch { return NextResponse.json({ error: 'Unable to load quote email template.' }, { status: 500 }) }
}
export async function POST(request: NextRequest) {
 const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 256 * 1024)
 if (blocked) return blocked
 const actor = await getContractProductActor(request)
 if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 if (actor.role !== 'owner' && actor.role !== 'manager') return NextResponse.json({ error: 'Only owners and managers can edit defaults.' }, { status: 403 })
 try { return NextResponse.json(await manageQuoteEmailTemplate(actor, { ...await request.json(), action: 'quote-email-template.update' })) }
 catch { return NextResponse.json({ error: 'Unable to save template. Check the subject, message and merge fields.' }, { status: 400 }) }
}
