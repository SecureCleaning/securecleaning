'use client'

export function getAdminHeaders(): HeadersInit {
  let password = ''

  try {
    password = sessionStorage.getItem('admin_password') ?? ''
  } catch {}

  return password
    ? {
        'x-admin-password': password,
      }
    : {}
}
