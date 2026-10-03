import { getAdminSupabase } from '@/lib/supabase'
import { isIP } from 'node:net'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'

type RateLimitPolicy = {
  key: string
  limit: number
  windowMs: number
}


type AbuseValidationOptions = {
  requireAcceptableUse?: boolean
  minElapsedMs?: number
  maxElapsedMs?: number
}

const HONEYPOT_FIELDS = ['website', 'companyWebsiteUrl', 'faxNumber', 'middleName']

function now() {
  return Date.now()
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export function getClientIp(request: NextRequest) {
  // Vercel overwrites this header at its ingress. Other deployments share a
  // conservative bucket until their trusted ingress contract is configured.
  const value = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.trim() : null
  return value && isIP(value) ? value : 'unknown'
}

export function getClientFingerprint(request: NextRequest) {
  return hash(getClientIp(request))
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

async function consumeRateLimit(subject: string, policy: RateLimitPolicy) {
  try {
    const { data, error } = await getAdminSupabase().rpc('consume_public_rate_limit', {
      p_policy: policy.key, p_subject: subject, p_limit: policy.limit, p_window_ms: policy.windowMs,
    })
    if (error || !data || typeof data.allowed !== 'boolean') throw new Error('Limiter unavailable')
    if (data.allowed) return null
    return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, {
      status: 429, headers: { 'Retry-After': String(Math.max(1, Number(data.retry_after) || 60)) },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Service temporarily unavailable. Please try again shortly.' }, {
      status: 503, headers: { 'Retry-After': '60' },
    })
  }
}
export async function rateLimit(request: NextRequest, policy: RateLimitPolicy) {
  return consumeRateLimit(getClientFingerprint(request), policy)
}
export async function rateLimitValue(value: string | null | undefined, policy: RateLimitPolicy) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized) return null
  return consumeRateLimit(hash(normalized), policy)
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
