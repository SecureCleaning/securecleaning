import 'server-only'
import { getAdminSupabase } from './supabase'
import { smsAlert } from './smsAlerts'
import type { BookingInputs } from './types'

// This is an appointment notification, not permission for marketing messages.
export function bookingSmsSnapshot(inputs: BookingInputs) {
  return {
    date: inputs.preferredStartDate || '', start: inputs.preferredInspectionStartTime || '',
    end: inputs.preferredInspectionEndTime || '', assignee: inputs.preferredInspectionAssigneeId || '',
    source: inputs.inspectionBookingSource || '', proposals: inputs.requestedInspectionTimes || [],
  }
}

export type InspectionSmsReceipt = {
  entityType: 'booking' | 'sale_inspection'; entityRef: string;
  kind: 'confirmation'; phone: string; email: string;
  snapshot: Record<string, unknown>; providerMessageId?: string | null;
}

/** Called only after the client email is accepted. Failure must never retry that email. */
export async function recordInspectionEmailSms(input: InspectionSmsReceipt): Promise<void> {
  try {
    if (!input.providerMessageId?.trim()) throw new Error('Missing email acceptance')
    const { data, error } = await getAdminSupabase().rpc('sms_record_inspection_email', {
      p_entity_type: input.entityType, p_entity_ref: input.entityRef, p_kind: input.kind,
      p_phone: input.phone, p_recipient: input.email, p_snapshot: input.snapshot,
      p_provider_message_id: input.providerMessageId,
    })
    if (error || data !== true) throw new Error('Inspection SMS receipt was not saved')
  } catch {
    console.error('[inspectionSms] Client email accepted; SMS needs review. Do not resend the email.')
    try { await smsAlert('inspection_sms_queue_failed', undefined, `${input.entityType}:${input.entityRef}:${input.providerMessageId || 'unknown'}`) } catch {
      console.error('[inspectionSms] SMS alert could not be recorded.')
    }
  }
}
