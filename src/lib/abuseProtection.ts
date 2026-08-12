import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'

type RateLimitPolicy = {
  key: string
  limit: number
  windowMs: number
}

type RateRecord = {
  count: number
  resetAt: number
}

type AbuseValidationOptions = {
  requireAcceptableUse?: boolean
  minElapsedMs?: number
  maxElapsedMs?: number
}

const rateStore = new Map<string, RateRecord>()
const HONEYPOT_FIELDS = ['website', 'companyWebsiteUrl', 'faxNumber', 'middleName']

function now() {
  return Date.now()
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function normalizeHeaderIp(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

export function getClientIp(request: NextRequest) {
  return (
    normalizeHeaderIp(request.headers.get('cf-connecting-ip')) ||
    normalizeHeaderIp(request.headers.get('x-real-ip')) ||
    normalizeHeaderIp(request.headers.get('x-forwarded-for')) ||
    'unknown'
  )
}

export function getClientFingerprint(request: NextRequest) {
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent')?.slice(0, 160) ?? 'unknown'
  return hash(`${ip}|${userAgent}`)
}

export function rejectLargePayload(request: NextRequest, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return NextResponse.json(
      { success: false, error: 'Request is too large.' },
      { status: 413 }
    )
  }
  return null
}

export function rejectCrossOriginMutation(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return null

  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const requestHost = request.nextUrl.host
  if (originHost !== requestHost) {
    return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  return null
}

export function rateLimit(request: NextRequest, policy: RateLimitPolicy) {
  const currentTime = now()
  const clientKey = `${policy.key}:${getClientFingerprint(request)}`
  const existing = rateStore.get(clientKey)

  if (!existing || existing.resetAt <= currentTime) {
    rateStore.set(clientKey, {
      count: 1,
      resetAt: currentTime + policy.windowMs,
    })
    return null
  }

  if (existing.count >= policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000))
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please wait before trying again.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(policy.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(existing.resetAt / 1000)),
        },
      }
    )
  }

  existing.count += 1
  rateStore.set(clientKey, existing)
  return null
}

export function rateLimitValue(value: string | null | undefined, policy: RateLimitPolicy) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null

  const currentTime = now()
  const key = `${policy.key}:${hash(normalized)}`
  const existing = rateStore.get(key)

  if (!existing || existing.resetAt <= currentTime) {
    rateStore.set(key, {
      count: 1,
      resetAt: currentTime + policy.windowMs,
    })
    return null
  }

  if (existing.count >= policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000))
    return NextResponse.json(
      { success: false, error: 'Too many submissions for these details. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    )
  }

  existing.count += 1
  rateStore.set(key, existing)
  return null
}

export function validatePublicSubmission(
  body: Record<string, unknown>,
  options: AbuseValidationOptions = {}
) {
  const filledHoneypot = HONEYPOT_FIELDS.some((field) => {
    const value = body[field]
    return typeof value === 'string' && value.trim().length > 0
  })

  if (filledHoneypot) {
    return NextResponse.json({ success: false, error: 'Submission rejected.' }, { status: 400 })
  }

  if (options.requireAcceptableUse && body.acceptableUseAccepted !== true) {
    return NextResponse.json(
      { success: false, error: 'Please confirm this is a genuine authorised enquiry.' },
      { status: 400 }
    )
  }

  const startedAt = typeof body.formStartedAt === 'number' ? body.formStartedAt : Number(body.formStartedAt)
  if (Number.isFinite(startedAt)) {
    const elapsed = now() - startedAt
    const minElapsedMs = options.minElapsedMs ?? 0
    const maxElapsedMs = options.maxElapsedMs ?? 1000 * 60 * 60 * 24

    if (elapsed < minElapsedMs || elapsed > maxElapsedMs) {
      return NextResponse.json({ success: false, error: 'Please refresh the form and try again.' }, { status: 400 })
    }
  }

  return null
}

export function limitString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > maxLength
}

export function createMethodNotAllowed() {
  return NextResponse.json({ success: false, error: 'Method not allowed.' }, { status: 405 })
}
