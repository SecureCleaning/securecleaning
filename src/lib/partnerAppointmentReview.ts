import 'server-only'
import { getAdminSupabase } from './supabase'
import { loadPartnerBusy, loadPartnerConfig } from './partnerBookingAvailability'
import { PartnerError } from './partnerBookingPolicy'
import { getCityTimeZone, getDateTimeInTimeZone } from './calendarInvite'
import { sendPartnerAppointmentNotice } from './partnerAppointmentMessages'
import { upsertContractSaleInspectionEvent } from './googleCalendar'
import type { BookingInputs } from './types'
import type { ProposedAppointment } from './partnerAppointmentPolicy'

export type ReviewActor = { id: string; assigneeId?: string }
const columns = 'id,booking_id,assigned_assignee_id,proposed_times,decision_status,selected_proposal,decision_reason,decided_at,created_at,email_status,calendar_status,decision_email_status,decision_calendar_status'
export async function listPartnerAppointmentRequests(actor: ReviewActor) {
  const db = getAdminSupabase()
  // Pending requests cannot fall off a recent-history limit.
  const query = (pending: boolean) => {
    let q = db.from('partner_booking_requests').select(columns).eq('request_kind','request')
    q = pending ? q.eq('decision_status','pending').order('created_at',{ascending:true}) : q.neq('decision_status','pending').order('decided_at',{ascending:false})
    return actor.assigneeId ? q.eq('assigned_assignee_id',actor.assigneeId) : q
  }
  const [pending,recent] = await Promise.all([query(true).limit(101),query(false).limit(20)])
  if(pending.error) throw pending.error
  if(recent.error) throw recent.error
  const rows = [...(pending.data || []).slice(0,100),...(recent.data || [])]
  if (!rows.length) return {requests:[],morePending:false}
  const {data:bookings,error} = await db.from('bookings').select('id,booking_ref,inputs,opportunity_id').in('id',rows.map(r=>r.booking_id))
  if(error) throw error
  return {requests:rows.map(r=>({ ...r,booking:bookings?.find(b=>b.id===r.booking_id) ?? null })),morePending:(pending.data?.length || 0)>100}
}
export async function reviewPartnerAppointmentRequest(actor: ReviewActor, body: Record<string,unknown>) {
  if(typeof body.id!=='string' || !/^[0-9a-f-]{36}$/i.test(body.id) || !['confirmed','declined'].includes(String(body.decision)) || body.reviewed!==true) throw new PartnerError('Review the request and choose a decision.')
  const selected = body.decision==='confirmed' ? body.selected : null
  if(body.decision==='confirmed' && (!Number.isInteger(selected) || Number(selected)<0 || Number(selected)>4)) throw new PartnerError('Choose one proposed time.')
  const reason = typeof body.reason==='string' ? body.reason.trim() : ''
  if(reason.length>1000 || (body.decision==='declined' && !reason)) throw new PartnerError('Enter a short internal reason for declining.')
  const db=getAdminSupabase()
  let query=db.from('partner_booking_requests').select(columns).eq('id',body.id).eq('request_kind','request')
  if(actor.assigneeId) query=query.eq('assigned_assignee_id',actor.assigneeId)
  const {data:r,error}=await query.maybeSingle()
  if(error) throw error
  if(!r) throw new PartnerError('Appointment request not found.',404)
  if(r.decision_status!=='pending') {
    if(r.decision_status===body.decision && r.selected_proposal===selected) return {replay:true,emailStatus:r.decision_email_status,calendarStatus:r.decision_calendar_status}
    throw new PartnerError('This request has already been reviewed. Refresh the list.',409)
  }
  if(['queued','sending'].includes(r.email_status)) throw new PartnerError('The initial request notification is still processing. Please refresh shortly.',409)
  const {data:b,error:bookingError}=await db.from('bookings').select('inputs,booking_ref').eq('id',r.booking_id).single()
  if(bookingError) throw bookingError
  const inputs=b.inputs as BookingInputs, proposals=r.proposed_times as ProposedAppointment[]
  const source=await loadPartnerConfig(), agent=source.config.assignees.find(a=>a.id===r.assigned_assignee_id)
  if(!agent?.active || agent.city!==inputs.city) throw new PartnerError('The assigned agent is no longer active in this state. An administrator must review the request.',409)
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(agent.email?.trim() || '')) throw new PartnerError('The agent notification email needs correcting before this request can be reviewed.',409)
  let startsAt:Date | null=null
  if(body.decision==='confirmed') {
    const p=proposals[Number(selected)]
    if(!p) throw new PartnerError('Choose a proposed time.')
    startsAt=getDateTimeInTimeZone(p.date,p.startTime,getCityTimeZone(inputs.city))
    if(startsAt.getTime()<=Date.now()) throw new PartnerError('That proposed time has passed. Choose another time or decline the request.',409)
    const busy=await loadPartnerBusy({...source.config,assignees:[agent]},inputs.city,p.date,p.date)
    const start=startsAt.getTime(), end=start+10*60000, travel=50*60000
    if(busy.some(v=>v.assigneeId===agent.id && start<v.end.getTime()+travel && end+travel>v.start.getTime())) throw new PartnerError('This time conflicts with an appointment or travel allowance. Choose another proposal or decline the request.',409)
  }
  const {data:result,error:decisionError}=await db.rpc('decide_partner_appointment_request',{p_id:r.id,p_assignee_id:r.assigned_assignee_id,p_actor:actor.id,p_decision:body.decision,p_selected:selected,p_reason:reason,p_config:source.content})
  if(decisionError) {
    if(['23P01','23514'].includes(decisionError.code)) throw new PartnerError('The request or calendar has changed. Refresh and review before confirming.',409)
    if(decisionError.code==='42501') throw new PartnerError('Request no longer available.',404)
    throw decisionError
  }
  if(!result.created) return {replay:true,emailStatus:'check_history',calendarStatus:'check_history'}
  let emailStatus='review_required',calendarStatus=body.decision==='declined' ? 'not_required' : 'internal'
  if(startsAt && agent.calendarId?.trim()) {
    try {
      const sync=await upsertContractSaleInspectionEvent({inspectionId:r.id,calendarId:agent.calendarId,startsAt,durationMinutes:10,timeZone:getCityTimeZone(inputs.city),summary:`Site inspection - ${inputs.businessName}`,description:`Booking: ${b.booking_ref}\nContact: ${inputs.contactName}\nPhone: ${inputs.phone}\nInternal notes: ${inputs.notes || 'None'}`,location:`${inputs.address}, ${inputs.suburb} ${inputs.postcode}`})
      calendarStatus=sync.status==='failed'?'review_required':'sent'
    } catch { calendarStatus='review_required' }
  }
  try {
    await sendPartnerAppointmentNotice({requestId:r.id,bookingRef:b.booking_ref,inputs:result.inputs,proposals,agentEmail:agent.email!.trim().toLowerCase(),state:body.decision as 'confirmed'|'declined',selected:selected as number|null})
    emailStatus='sent'
  } catch { /* Retain the claim: an uncertain delivery must not be sent twice. */ }
  const {error:saveError}=await db.from('partner_booking_requests').update({decision_email_status:emailStatus,decision_calendar_status:calendarStatus}).eq('id',r.id)
  return {replay:false,emailStatus:saveError?'review_required':emailStatus,calendarStatus:saveError?'review_required':calendarStatus}
}
