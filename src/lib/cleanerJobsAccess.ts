import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export const CLEANER_JOBS_SESSION_COOKIE = 'securecleaning_jobs_session'
export const CLEANER_JOBS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const TOKEN_VERSION = 1

function secret() {
  return (process.env.ADMIN_SESSION_SECRET ?? '').trim()
}

function sign(purpose: string, value: string) {
  const key = secret()
  return key ? createHmac('sha256', key).update(`contract-jobs:${purpose}:${value}`).digest('base64url') : ''
}

function equal(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

export function createCleanerJobsAccessToken(accessLinkId: string) {
  const signature = sign('access', accessLinkId)
  return signature ? `${accessLinkId}.${signature}` : ''
}

export function verifyCleanerJobsAccessToken(token: string) {
  const [accessLinkId, signature] = token.trim().split('.')
  if (!/^[0-9a-f-]{36}$/i.test(accessLinkId ?? '')) return null
  return equal(signature ?? '', sign('access', accessLinkId)) ? accessLinkId : null
}

export function createCleanerJobsSessionToken(accessLinkId: string) {
  const payload = Buffer.from(JSON.stringify({
    v: TOKEN_VERSION,
    linkId: accessLinkId,
    exp: Math.floor(Date.now() / 1000) + CLEANER_JOBS_SESSION_MAX_AGE_SECONDS,
  })).toString('base64url')
  const signature = sign('session', payload)
  return signature ? `${payload}.${signature}` : ''
}

export function verifyCleanerJobsSessionToken(token: string | null | undefined) {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !equal(signature ?? '', sign('session', payload))) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: number
      linkId?: string
      exp?: number
    }
    if (parsed.v !== TOKEN_VERSION || !/^[0-9a-f-]{36}$/i.test(parsed.linkId ?? '')) return null
    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) return null
    return parsed.linkId!
  } catch {
    return null
  }
}
