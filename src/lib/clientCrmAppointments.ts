import { writeAuditLog } from '@/lib/auditLog'
import {
  getAvailabilityAssignee,
  getAvailabilityConfig,
} from '@/lib/availability'
import { getCityTimeZone } from '@/lib/calendarInvite'
import { actorCanAccessOpportunity, type ClientCrmActor } from '@/lib/clientCrmAuth'
import { getManualInspectionWindow } from '@/lib/clientCrmAppointmentTime'
import { ClientCrmError } from '@/lib/clientCrmData'
import { sendBookingConfirmationEmail } from '@/lib/email'
import { createBookingFollowUpEvent } from '@/lib/googleCalendar'
import { getAdminSupabase } from '@/lib/supabase'
import { listStaffAccounts } from '@/lib/staffAccounts'
import type { BookingInputs, CleaningFrequency, PremisesType, TimePreference } from '@/lib/types'

const PREMISES_TYPES: PremisesType[] = [
  'office', 'medical', 'industrial', 'childcare', 'retail', 'gym', 'warehouse',
  'function_centre', 'sports_facility', 'other',
]
const CLEANING_FREQUENCIES: CleaningFrequency[] = ['daily', '3x_week', '2x_week', 'weekly', 'fortnightly']
const TIME_PREFERENCES: TimePreference[] = ['business_hours', 'after_hours', 'weekend']

type AppointmentContext = {
  opportunity: Record<string, unknown>
  contact: Record<string, unknown>
  site: Record<string, unknown>
  organisation: Record<string, unknown>
}

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function valueFromList<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null
}

function bookingReference(date: string, idempotencyKey: string) {
  return `BK-${date.replaceAll('-', '')}-${idempotencyKey.replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

async function loadAppointmentContext(actor: ClientCrmActor, opportunityId: string): Promise<AppointmentContext> {
  if (!isUuid(opportunityId)) throw new ClientCrmError('Select a valid CRM opportunity.')
  const db = getAdminSupabase()
  const { data: opportunity, error: opportunityError } = await db.from('crm_opportunities')
    .select('id, organisation_id, primary_contact_id, site_id, assigned_staff_id, stage')
    .eq('id', opportunityId)
    .maybeSingle()
  if (opportunityError) throw opportunityError
  if (!opportunity || !actorCanAccessOpportunity(actor, opportunity.assigned_staff_id)) {
    throw new ClientCrmError('Opportunity not found.', 404)
  }
  if (['won', 'lost', 'cancelled'].includes(String(opportunity.stage ?? ''))) {
    throw new ClientCrmError('Reopen this opportunity before creating an inspection appointment.', 409)
  }
  if (!opportunity.primary_contact_id || !opportunity.site_id || !opportunity.organisation_id) {
    throw new ClientCrmError('Save a primary contact and confirmed site before creating an appointment.', 409)
  }

  const [contactResult, siteResult, organisationResult] = await Promise.all([
    db.from('clients').select('id, business_name, contact_name, email, phone').eq('id', opportunity.primary_contact_id).maybeSingle(),
    db.from('sites').select('id, site_name, address, suburb, postcode, city').eq('id', opportunity.site_id).maybeSingle(),
    db.from('crm_organisations').select('id, business_name').eq('id', opportunity.organisation_id).maybeSingle(),
  ])
  if (contactResult.error) throw contactResult.error
  if (siteResult.error) throw siteResult.error
  if (organisationResult.error) throw organisationResult.error
  if (!contactResult.data || !siteResult.data || !organisationResult.data) {
    throw new ClientCrmError('The CRM contact or site record is incomplete.', 409)
  }

  if (actor.role === 'agent' && String(opportunity.assigned_staff_id ?? '') !== actor.id) {
    throw new ClientCrmError('This appointment must be booked into your assigned inspection calendar.', 403)
  }

  return {
    opportunity: opportunity as Record<string, unknown>,
    contact: contactResult.data as Record<string, unknown>,
    site: siteResult.data as Record<string, unknown>,
    organisation: organisationResult.data as Record<string, unknown>,
  }
}

function appointmentLocation(context: AppointmentContext) {
  return {
    address: String(context.site.address ?? '').trim(),
    suburb: String(context.site.suburb ?? '').trim(),
    postcode: String(context.site.postcode ?? '').trim(),
  }
}

function appointmentCity(context: AppointmentContext) {
  const city = context.site.city
  if (city !== 'melbourne' && city !== 'sydney') {
    throw new ClientCrmError('The site must have a Melbourne or Sydney service region before booking.', 409)
  }
  return city
}


export async function createCrmInspectionAppointment(actor: ClientCrmActor, input: Record<string, unknown>) {
  const opportunityId = clean(input.opportunityId, 100)
  const preferredDate = clean(input.preferredDate, 10)
  const startTime = clean(input.startTime, 5)
  const durationMinutes = Number(input.durationMinutes)
  const assignedStaffId = clean(input.assignedStaffId, 100)
  const idempotencyKey = clean(input.idempotencyKey, 100)
  const premisesType = valueFromList(input.premisesType, PREMISES_TYPES)
  const frequency = valueFromList(input.frequency, CLEANING_FREQUENCIES)
  const timePreference = valueFromList(input.timePreference, TIME_PREFERENCES)
  if (!isUuid(idempotencyKey)) {
    throw new ClientCrmError('Unable to verify this appointment request. Refresh the page and try again.')
  }
  if (!premisesType || !frequency || !timePreference) {
    throw new ClientCrmError('Choose the premises type, cleaning frequency, and cleaning time preference.')
  }

  const context = await loadAppointmentContext(actor, opportunityId)
  const city = appointmentCity(context)
  const location = appointmentLocation(context)
  const bookingRef = bookingReference(preferredDate, idempotencyKey)
  const db = getAdminSupabase()
  let inspectionWindow
  try {
    inspectionWindow = getManualInspectionWindow({
      date: preferredDate,
      startTime,
      durationMinutes,
      timeZone: getCityTimeZone(city),
    })
  } catch (error) {
    throw new ClientCrmError(error instanceof Error ? error.message : 'Choose a valid inspection date and time.')
  }

  const { data: existing, error: existingError } = await db.from('bookings')
    .select('id, booking_ref, opportunity_id, inspection_scheduled_for')
    .eq('booking_ref', bookingRef)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    if (String(existing.opportunity_id ?? '') !== opportunityId) {
      throw new ClientCrmError('This appointment request conflicts with another saved booking.', 409)
    }
    return { bookingRef, scheduledFor: String(existing.inspection_scheduled_for ?? ''), created: false }
  }

  const { data: activeAppointment, error: activeError } = await db.from('bookings')
    .select('booking_ref, inspection_scheduled_for')
    .eq('opportunity_id', opportunityId)
    .neq('status', 'cancelled')
    .eq('inspection_status', 'scheduled')
    .gte('inspection_scheduled_for', new Date().toISOString())
    .order('inspection_scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (activeError) throw activeError
  if (activeAppointment) {
    throw new ClientCrmError(`This opportunity already has appointment ${activeAppointment.booking_ref}. Cancel or complete it before adding another.`, 409)
  }

  const staff = await listStaffAccounts()
  const currentAssignedStaffId = String(context.opportunity.assigned_staff_id ?? '')
  if (actor.role !== 'agent' && currentAssignedStaffId && assignedStaffId && assignedStaffId !== currentAssignedStaffId) {
    throw new ClientCrmError('Save the new assigned agent in the opportunity workflow before booking.', 409)
  }
  const resolvedStaffId = actor.role === 'agent'
    ? actor.id
    : (currentAssignedStaffId || assignedStaffId)
  const selectedAgent = staff.find((account) => account.id === resolvedStaffId && account.active && account.role === 'agent')
  if (!selectedAgent?.availabilityAssigneeId) {
    throw new ClientCrmError('Choose an active inspection agent with a linked calendar.', 409)
  }
  if (actor.role === 'agent' && selectedAgent.id !== actor.id) {
    throw new ClientCrmError('This appointment must be booked into your assigned inspection calendar.', 403)
  }
  const config = await getAvailabilityConfig()
  const availabilityAssignee = getAvailabilityAssignee(config, selectedAgent.availabilityAssigneeId)
  if (!availabilityAssignee?.active) throw new ClientCrmError('That inspection calendar is no longer active.', 409)
  if (availabilityAssignee.city !== city) {
    throw new ClientCrmError('Choose an inspection agent assigned to this site’s service region.', 409)
  }

  const contactName = String(context.contact.contact_name ?? '').trim()
  const email = String(context.contact.email ?? '').trim()
  const phone = String(context.contact.phone ?? '').trim()
  const address = location.address
  const suburb = location.suburb
  const postcode = location.postcode
  if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !address || !suburb || !/^\d{4}$/.test(postcode)) {
    throw new ClientCrmError('Complete the contact email, phone, street address, suburb, and postcode before booking.', 409)
  }

  const bookingInputs: BookingInputs = {
    businessName: String(context.organisation.business_name ?? context.contact.business_name ?? context.site.site_name ?? '').trim(),
    contactName,
    email,
    phone,
    address,
    city,
    suburb,
    postcode,
    premisesType,
    frequency,
    timePreference,
    preferredStartDate: preferredDate,
    preferredInspectionSlotId: `crm-manual:${inspectionWindow.startTime}`,
    preferredInspectionSlotLabel: inspectionWindow.label,
    preferredInspectionDay: inspectionWindow.day,
    preferredInspectionStartTime: inspectionWindow.startTime,
    preferredInspectionEndTime: inspectionWindow.endTime,
    preferredInspectionAssigneeId: availabilityAssignee.id,
    preferredInspectionAssigneeName: selectedAgent.displayName,
    preferredInspectionCalendarId: availabilityAssignee.calendarId,
    inspectionBookingSource: 'crm_manual',
    inspectionDurationMinutes: durationMinutes,
    inspectionAvailabilityOverridden: true,
    addOns: {
      bathrooms: 0,
      kitchens: 0,
      windows: 0,
      consumables: false,
      highTouchDisinfection: false,
      carpetSteam: false,
    },
  }

  const { data: booking, error: bookingError } = await db.from('bookings').insert({
    booking_ref: bookingRef,
    quote_id: null,
    client_id: String(context.contact.id),
    site_id: String(context.site.id),
    opportunity_id: opportunityId,
    assigned_operator_id: availabilityAssignee.ownerOperatorId || null,
    inputs: bookingInputs,
    status: 'pending',
    inspection_status: 'scheduled',
    inspection_scheduled_for: inspectionWindow.start.toISOString(),
    first_clean_date: preferredDate,
    recurring_schedule: {
      frequency,
      timeStart: timePreference === 'after_hours' ? '18:00' : '08:00',
    },
  }).select('id').single()
  if (bookingError?.code === '23505') {
    const { data: raced } = await db.from('bookings')
      .select('booking_ref, opportunity_id, inspection_scheduled_for')
      .eq('booking_ref', bookingRef)
      .maybeSingle()
    if (raced && String(raced.opportunity_id ?? '') === opportunityId) {
      return { bookingRef, scheduledFor: String(raced.inspection_scheduled_for ?? ''), created: false }
    }
  }
  if (bookingError || !booking) throw bookingError ?? new Error('Appointment insert did not return a booking.')

  if (['new', 'contacted', 'qualified'].includes(String(context.opportunity.stage ?? ''))) {
    await db.from('crm_opportunities')
      .update({ stage: 'inspection', updated_at: new Date().toISOString() })
      .eq('id', opportunityId)
      .eq('stage', String(context.opportunity.stage))
  }
  if (!context.opportunity.assigned_staff_id) {
    await db.from('crm_opportunities')
      .update({ assigned_staff_id: selectedAgent.id, updated_at: new Date().toISOString() })
      .eq('id', opportunityId)
      .is('assigned_staff_id', null)
  }
  await writeAuditLog('booking', bookingRef, 'crm.inspection.created', {
    opportunityId,
    actorId: actor.id,
    actorRole: actor.role,
    scheduledFor: inspectionWindow.start.toISOString(),
    durationMinutes,
    availabilityOverridden: true,
    assigneeId: availabilityAssignee.id,
    assignedStaffId: selectedAgent.id,
  })

  try {
    await sendBookingConfirmationEmail(bookingRef, bookingInputs)
  } catch (error) {
    console.error('[clientCrmAppointments] Confirmation email failed:', error)
  }
  createBookingFollowUpEvent(bookingRef, bookingInputs).catch((error) => {
    console.error('[clientCrmAppointments] Calendar event failed:', error)
  })

  return { bookingRef, scheduledFor: inspectionWindow.start.toISOString(), created: true }
}
