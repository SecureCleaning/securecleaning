type AppointmentReviewState = {
  decision_status: string
  email_status: string
  calendar_status: string
  decision_email_status: string
  decision_calendar_status: string
  contact_review_required?: boolean
}

export function needsAppointmentDeliveryCheck(row: AppointmentReviewState) {
  // A final decision sends fresh notices and updates/cancels the proposed invites.
  // Earlier notification failures remain audit history, not unfinished decision work.
  const decided = row.decision_status === 'confirmed' || row.decision_status === 'declined'
  const statuses = decided
    ? [row.decision_email_status, row.decision_calendar_status]
    : [row.email_status, row.calendar_status]
  return statuses.some(status => ['review_required', 'sending', 'queued'].includes(status))
}

export function showAppointmentRequest(row: AppointmentReviewState, showHistory = false) {
  return showHistory || row.decision_status === 'pending' || needsAppointmentDeliveryCheck(row) || row.contact_review_required === true
}
