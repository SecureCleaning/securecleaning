export function resolveFinalQuoteRecipient(reviewedEmail: string, requestedEmail?: unknown) {
  const authoritative = reviewedEmail.trim().toLowerCase()
  const requested = typeof requestedEmail === 'string' ? requestedEmail.trim().toLowerCase() : authoritative
  return { authoritative, matches: requested === authoritative }
}

export function getSendFailureDisposition(providerCallStarted: boolean, providerAccepted: boolean, definiteProviderRejection = false) {
  if (definiteProviderRejection) {
    return {
      markFailed: true, failureStage: 'provider_rejected' as const, reconciliationRequired: false,
      providerAccepted: false, status: 502, error: 'The email provider rejected this delivery. Review the address and retry.',
    }
  }
  if (providerCallStarted) {
    return {
      markFailed: false,
      failureStage: null,
      reconciliationRequired: true,
      providerAccepted,
      status: 409,
      error: 'Email delivery is accepted or uncertain and needs reconciliation. Do not resend.',
    }
  }
  return {
    markFailed: true,
    failureStage: 'internal_before_provider' as const,
    reconciliationRequired: false,
    providerAccepted: false,
    status: 500,
    error: 'The final quote could not be sent. Please retry or contact support.',
  }
}
