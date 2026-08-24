export function isValidAdminAlertId(alertId: string) {
  return Boolean(
    alertId
      && alertId.length <= 120
      && /^(?:quote|booking(?:-unassigned|-overdue)?)-[a-z0-9-]+$/i.test(alertId)
  )
}
