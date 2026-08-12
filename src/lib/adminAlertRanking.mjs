/**
 * @typedef {'info' | 'warning' | 'critical'} AdminAlertSeverity
 */

/**
 * @typedef {{
 *   severity: AdminAlertSeverity
 *   happenedAt: number
 * }} RankableAdminAlert
 */

const severityRank = {
  critical: 3,
  warning: 2,
  info: 1,
}

/**
 * Sort alerts by severity first, then oldest-first within each severity bucket.
 * Truncation happens after sorting so critical workflow items are not pushed out
 * by lower-priority alerts that happened to be gathered earlier.
 *
 * @template {RankableAdminAlert} T
 * @param {T[]} alerts
 * @param {number} [limit=20]
 * @returns {T[]}
 */
export function rankAdminAlerts(alerts, limit = 20) {
  return [...alerts]
    .sort((a, b) => {
      const severityDelta = severityRank[b.severity] - severityRank[a.severity]
      if (severityDelta !== 0) return severityDelta

      return a.happenedAt - b.happenedAt
    })
    .slice(0, limit)
}
