import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { getAdminSessionIdentityFromRequest, getAdminSessionIdentityFromCookies } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'
import {
  getAvailabilityAssignee,
  getAvailabilityConfig,
} from '@/lib/availability'
import { verifyAvailabilityAccessCode } from '@/lib/availabilityAccessCode'

export const AVAILABILITY_AGENT_SESSION_COOKIE = 'securecleaning_availability_agent_session'
export const AVAILABILITY_AGENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12
const AVAILABILITY_AGENT_SESSION_VERSION = 1
const AVAILABILITY_AGENT_FEED_VERSION = 1

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function getAvailabilityAgentSessionSecret(assigneeId: string, accessCodeHash: string) {
  return assigneeId && accessCodeHash
    ? `securecleaning-availability-agent:${assigneeId}:${accessCodeHash}`
    : ''
}

function signAvailabilityAgentPayload(payload: string, assigneeId: string, accessCodeHash: string) {
  const secret = getAvailabilityAgentSessionSecret(assigneeId, accessCodeHash)
  if (!secret) return ''
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createAvailabilityAgentSessionToken(assigneeId: string, accessCodeHash: string) {
  const secret = getAvailabilityAgentSessionSecret(assigneeId, accessCodeHash)
  if (!secret) return null

  const payload = Buffer.from(
    JSON.stringify({
      v: AVAILABILITY_AGENT_SESSION_VERSION,
      a: assigneeId,
      exp: Math.floor(Date.now() / 1000) + AVAILABILITY_AGENT_SESSION_MAX_AGE_SECONDS,
    })
  ).toString('base64url')

  const signature = signAvailabilityAgentPayload(payload, assigneeId, accessCodeHash)
  if (!signature) return null

  return `${payload}.${signature}`
}

export function createAvailabilityAgentFeedToken(assigneeId: string, accessCodeHash: string) {
  const secret = getAvailabilityAgentSessionSecret(assigneeId, accessCodeHash)
  if (!secret) return null

  const payload = Buffer.from(
    JSON.stringify({
      v: AVAILABILITY_AGENT_FEED_VERSION,
      a: assigneeId,
      scope: 'feed',
    })
  ).toString('base64url')

  const signature = signAvailabilityAgentPayload(payload, assigneeId, accessCodeHash)
  if (!signature) return null

  return `${payload}.${signature}`
}

export function isValidAvailabilityAgentSessionToken(
  token: string | null | undefined,
  assigneeId: string,
  accessCodeHash: string
) {
  const candidate = normalize(token)
  if (!candidate) return false

  const [payload, signature] = candidate.split('.')
  if (!payload || !signature) return false

  const expectedSignature = signAvailabilityAgentPayload(payload, assigneeId, accessCodeHash)
  if (!expectedSignature || expectedSignature.length !== signature.length) return false

  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return false

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: number
      a?: string
      exp?: number
    }

    if (parsed.v !== AVAILABILITY_AGENT_SESSION_VERSION) return false
    if (parsed.a !== assigneeId) return false
    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) return false
    return true
  } catch {
    return false
  }
}

export function isValidAvailabilityAgentFeedToken(
  token: string | null | undefined,
  assigneeId: string,
  accessCodeHash: string
) {
  const candidate = normalize(token)
  if (!candidate) return false

  const [payload, signature] = candidate.split('.')
  if (!payload || !signature) return false

  const expectedSignature = signAvailabilityAgentPayload(payload, assigneeId, accessCodeHash)
  if (!expectedSignature || expectedSignature.length !== signature.length) return false

  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return false

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: number
      a?: string
      scope?: string
    }

    return (
      parsed.v === AVAILABILITY_AGENT_FEED_VERSION &&
      parsed.a === assigneeId &&
      parsed.scope === 'feed'
    )
  } catch {
    return false
  }
}

export async function hasAvailabilityAgentSession(assigneeId: string) {
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee?.active) return false

  const identity = await getAdminSessionIdentityFromCookies()
  if (identity?.role === 'agent') {
    const account = await getStaffAccountById(identity.id)
    if (account?.active && account.role === 'agent' && account.availability_assignee_id === assigneeId) return true
  }

  if (!assignee.accessCodeHash) return false

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(AVAILABILITY_AGENT_SESSION_COOKIE)?.value

  if (isValidAvailabilityAgentSessionToken(
    cookieValue,
    assigneeId,
    assignee.accessCodeHash
  )) return true

  return false
}

export async function isAuthorizedAvailabilityAgentRequest(request: NextRequest, assigneeId: string) {
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee?.active) return false

  const identity = getAdminSessionIdentityFromRequest(request)
  if (identity?.role === 'agent') {
    const account = await getStaffAccountById(identity.id)
    if (account?.active && account.role === 'agent' && account.availability_assignee_id === assigneeId) return true
  }

  if (!assignee.accessCodeHash) return false

  const headerCode = request.headers.get('x-availability-access-code')
  const sessionToken = request.cookies.get(AVAILABILITY_AGENT_SESSION_COOKIE)?.value

  if (
    verifyAvailabilityAccessCode(normalize(headerCode), assignee.accessCodeHash) ||
    isValidAvailabilityAgentSessionToken(sessionToken, assigneeId, assignee.accessCodeHash)
  ) return true

  return false
}
