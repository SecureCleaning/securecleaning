import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from './supabase'
import { loadPartnerConfig } from './partnerBookingAvailability'
import { partnerBookingDetails, PartnerError } from './partnerBookingPolicy'
import { parseProposedAppointments, proposalAgent } from './partnerAppointmentPolicy'
import { sendPartnerAppointmentNotice } from './partnerAppointmentMessages'
import type { PartnerActor } from './partnerBookingAuth'
import type { BookingInputs } from './types'

export async function createPartnerAppointmentRequest(actor: PartnerActor, body: Record<string, unknown>) {
  const details = partnerBookingDetails({...body,date:'request',slotId:'request'})
  const proposals = parseProposedAppointments(body.proposedTimes,details.city,null)
  const fingerprint = createHash('sha256').update(JSON.stringify({kind:'request',details,proposals})).digest('hex')
  const db = getAdminSupabase()
  const {data: replay,error: replayError} = await db.from('partner_booking_requests').select('input_hash,booking_id,email_status,calendar_status').eq('id',details.idempotencyKey).eq('user_id',actor.id).maybeSingle()
  if(replayError) throw replayError
  if(replay){
    if(replay.input_hash!==fingerprint) throw new PartnerError('This request was already used. Start a new request.',409)
    const {data,error}=await db.from('bookings').select('booking_ref').eq('id',replay.booking_id).single();if(error)throw error
    return {bookingRef:data.booking_ref,emailStatus:replay.email_status,calendarStatus:replay.calendar_status,pending:true,replay:true}
  }
  parseProposedAppointments(body.proposedTimes,details.city)
  const source=await loadPartnerConfig(), agent=proposalAgent(source.config,actor.company,details)
  if(!agent)throw new PartnerError('No permitted agent covers this suburb. Contact Secure Cleaning.')
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(agent.email?.trim() || ''))throw new PartnerError('The agent notification address needs a team check before requests can be submitted.',409)
  const inputs:BookingInputs={businessName:details.businessName,contactName:details.contactName,email:details.email,phone:details.phone,address:details.address,suburb:details.suburb,postcode:details.postcode,city:details.city,
    premisesType:details.premisesType as BookingInputs['premisesType'],frequency:details.frequency as BookingInputs['frequency'],timePreference:details.timePreference as BookingInputs['timePreference'],notes:details.notes,
    preferredStartDate:'',preferredInspectionAssigneeId:agent.id,preferredInspectionAssigneeName:agent.name,inspectionBookingSource:'partner_request',inspectionDurationMinutes:10,requestedInspectionTimes:proposals,
    addOns:{bathrooms:0,kitchens:0,windows:0,consumables:false,highTouchDisinfection:false,carpetSteam:false}}
  const {data:saved,error}=await db.rpc('create_partner_booking',{p_user_id:actor.id,p_session_version:actor.session_version,p_request_id:details.idempotencyKey,p_input_hash:fingerprint,p_inputs:inputs,p_start:null,p_config:source.content})
  if(error){if(['23P01','23514','23505'].includes(error.code))throw new PartnerError('The request needs a team review or availability has changed. Refresh before trying again.',409);if(error.code==='42501')throw new PartnerError('Your permissions have changed. Sign in again.',403);throw error}
  let emailStatus='queued',calendarStatus='queued'
  if(saved.created){
    const {data:claim,error:claimError}=await db.from('partner_booking_requests').update({email_status:'sending',calendar_status:'sending'}).eq('id',details.idempotencyKey).eq('email_status','queued').select('id').maybeSingle()
    if(!claimError&&claim){
      try{await sendPartnerAppointmentNotice({requestId:details.idempotencyKey,bookingRef:saved.bookingRef,inputs,proposals,agentEmail:agent.email!.trim().toLowerCase(),state:'pending'});emailStatus='sent';calendarStatus='sent'}catch{emailStatus='review_required';calendarStatus='review_required'}
      const {error:saveError}=await db.from('partner_booking_requests').update({email_status:emailStatus,calendar_status:calendarStatus}).eq('id',details.idempotencyKey)
      if(saveError){emailStatus='review_required';calendarStatus='review_required'}
    }
  }
  return {bookingRef:saved.bookingRef,emailStatus,calendarStatus,pending:true,replay:!saved.created}
}
