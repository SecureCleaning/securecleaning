import { getAdminSupabase } from '@/lib/supabase'

export async function writeAuditLog(
  entityType: string,
  entityRef: string,
  action: string,
  details: Record<string, unknown> = {}
) {
  try {
    const db = getAdminSupabase()
    await db.from('admin_audit_log').insert({
      entity_type: entityType,
      entity_ref: entityRef,
      action,
      details,
    })
  } catch (error) {
    console.error('[auditLog] Failed to write audit log:', error)
  }
}

export async function getAuditLog(entityType?: string, entityRef?: string) {
  try {
    const db = getAdminSupabase()
    let query = db
      .from('admin_audit_log')
      .select('id, entity_type, entity_ref, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    if (entityRef) {
      query = query.eq('entity_ref', entityRef)
    }

    const { data, error } = await query
    if (error) {
      console.error('[auditLog] Failed to read audit log:', error)
      return []
    }

    return data ?? []
  } catch (error) {
    console.error('[auditLog] Unexpected read error:', error)
    return []
  }
}
