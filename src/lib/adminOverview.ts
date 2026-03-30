import { getAdminAlerts } from '@/lib/alerts'
import { getAuditLog } from '@/lib/auditLog'
import { getReportingSnapshot, type ReportingSnapshot } from '@/lib/reporting'

export interface AdminAlertItem {
  id: string
  kind: 'new_quote' | 'new_booking' | 'overdue_inspection' | 'unassigned_booking'
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}

export interface AuditLogItem {
  id: string
  entity_type: string
  entity_ref: string
  action: string
  details: Record<string, unknown>
  created_at: string
}

export interface AdminOverviewData {
  reporting: ReportingSnapshot
  alerts: AdminAlertItem[]
  auditLog: AuditLogItem[]
}

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  const [reporting, alerts, auditLog] = await Promise.all([
    getReportingSnapshot(),
    getAdminAlerts(),
    getAuditLog(),
  ])

  return {
    reporting,
    alerts,
    auditLog: auditLog as AuditLogItem[],
  }
}
