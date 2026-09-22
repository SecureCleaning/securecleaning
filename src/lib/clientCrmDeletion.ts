import { getAdminSupabase } from '@/lib/supabase'

export type ClientCrmDeletionPreview = {
  opportunityId: string
  organisationId: string
  confirmationValue: string
  displayName: string
  previewToken: string
  blocked: boolean
  blockers: string[]
  opportunities: number
  contacts: number
  sites: number
  leads: number
  communications: number
  sentCommunications: number
  bookings: number
  activeBookings: number
  quotes: number
  contractProducts: number
  contractSales: number
  bookingSales: number
  ratings: number
}

export class ClientCrmDeletionAuthorizationError extends Error {}
export class ClientCrmDeletionNotFoundError extends Error {}
export class ClientCrmDeletionBlockedError extends Error {}

function requireOpportunityId(opportunityId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(opportunityId)) {
    throw new Error('Select a valid CRM record.')
  }
}

export async function getClientCrmDeletionPreview(opportunityId: string): Promise<ClientCrmDeletionPreview> {
  requireOpportunityId(opportunityId)
  const { data, error } = await getAdminSupabase().rpc('admin_preview_client_crm_deletion', {
    p_opportunity_id: opportunityId,
  })
  if (error?.code === 'P0002') throw new ClientCrmDeletionNotFoundError('CRM record not found.')
  if (error) throw error
  return data as ClientCrmDeletionPreview
}

export async function deleteClientCrmRecord(
  opportunityId: string,
  confirmation: string,
  reason: string,
  actor: { id: string; name: string; role: 'owner' },
  options: { deleteBookings: boolean; override: boolean; previewToken: string },
) {
  requireOpportunityId(opportunityId)
  const normalizedReason = reason.trim()
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    throw new Error('Enter a deletion reason between 10 and 500 characters.')
  }
  if (!options || typeof options.deleteBookings !== 'boolean' || typeof options.override !== 'boolean' || !/^[a-f0-9]{32}$/.test(options.previewToken)) {
    throw new Error('Review the deletion options before confirming.')
  }

  const preview = await getClientCrmDeletionPreview(opportunityId)
  if (confirmation !== preview.confirmationValue) {
    throw new Error('Type the exact client email shown to confirm deletion.')
  }

  const { data, error } = await getAdminSupabase().rpc('admin_delete_client_crm_record', {
    p_opportunity_id: opportunityId,
    p_reason: normalizedReason,
    p_actor: actor,
    p_delete_bookings: options.deleteBookings,
    p_override: options.override,
    p_preview_token: options.previewToken,
  })
  if (error) {
    if (error.code === '28000') throw new ClientCrmDeletionAuthorizationError('Active owner access required. Sign in again.')
    if (error.code === 'P0002') throw new ClientCrmDeletionNotFoundError('CRM record not found.')
    if (['23503', '40001', '42501', '55000'].includes(error.code ?? '')) {
      throw new ClientCrmDeletionBlockedError(error.message || 'The CRM record cannot be deleted with the selected options.')
    }
    throw error
  }
  return data
}
