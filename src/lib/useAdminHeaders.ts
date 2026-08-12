'use client'

export function getAdminHeaders(): HeadersInit {
  // Admin requests now rely on the signed httpOnly session cookie.
  return {}
}
