const ROBOFY_API_BASE = 'https://agents.robofy.ai'
const ROBOFY_REQUEST_TIMEOUT_MS = 5_000
const MAX_INBOX_SESSIONS = 100
const MAX_SESSION_ID_LENGTH = 128
const MAX_TIMESTAMP_LENGTH = 80
const MAX_MESSAGE_LENGTH = 500
const MAX_VISITOR_NAME_LENGTH = 120
const MAX_DIRECTION_LENGTH = 32
const ALLOWED_DIRECTIONS = new Set(['agent', 'assistant', 'inbound', 'outbound', 'user', 'visitor'])

export type RobofyInboxSession = {
  sessionId: string
  lastMessageTime: string | null
  lastMessage: string | null
  visitorName: string | null
  lastMessageDirection: string | null
}

export type RobofyInboxResult = {
  configured: boolean
  sessions: RobofyInboxSession[]
  error: string | null
}

function asBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function redactPrivateContent(value: string, apiKey: string | undefined) {
  let safeValue = value

  if (apiKey && apiKey.length >= 8) {
    safeValue = safeValue.split(apiKey).join('[redacted]')
  }

  return safeValue.replace(
    /\b(api[ _-]?key|access[ _-]?token|private[ _-]?token|bearer)\s*(?::|=|\s)\s*[^\s,;]+/gi,
    '$1=[redacted]'
  )
}

function containsPrivateContent(value: string, apiKey: string | undefined) {
  return Boolean(
    (apiKey && apiKey.length >= 8 && value.includes(apiKey)) ||
      /\b(api[ _-]?key|access[ _-]?token|private[ _-]?token|bearer)\s*(?::|=|\s)\s*[^\s,;]+/i.test(value)
  )
}

function asSafeText(value: unknown, maxLength: number, apiKey: string | undefined) {
  const bounded = asBoundedText(value, maxLength)
  return bounded && !containsPrivateContent(bounded, apiKey)
    ? redactPrivateContent(bounded, apiKey).slice(0, maxLength)
    : null
}

function asSessionId(value: unknown) {
  const sessionId = asBoundedText(value, MAX_SESSION_ID_LENGTH)
  return sessionId && !/[\u0000-\u001F\u007F]/.test(sessionId) ? sessionId : null
}

function asTimestamp(value: unknown) {
  const timestamp = asBoundedText(value, MAX_TIMESTAMP_LENGTH)
  if (!timestamp) return null

  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function asDirection(value: unknown) {
  const direction = asBoundedText(value, MAX_DIRECTION_LENGTH)?.toLowerCase()
  return direction && ALLOWED_DIRECTIONS.has(direction) ? direction : null
}

function getRobofyConfig() {
  return {
    apiKey: process.env.ROBOFY_API_KEY?.trim(),
    chatbotId: process.env.ROBOFY_CHATBOT_ID?.trim() || process.env.NEXT_PUBLIC_ROBOFY_CID?.trim(),
  }
}

function mapSession(value: unknown, apiKey: string | undefined): RobofyInboxSession | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const sessionId = asSessionId(source.session_id)
  if (!sessionId) return null

  return {
    sessionId,
    lastMessageTime: asTimestamp(source.last_message_time),
    lastMessage: asSafeText(source.last_message, MAX_MESSAGE_LENGTH, apiKey),
    visitorName: asSafeText(source.user_profile_name, MAX_VISITOR_NAME_LENGTH, apiKey),
    lastMessageDirection: asDirection(source.last_message_direction),
  }
}

export async function getRobofyInboxSessions(): Promise<RobofyInboxResult> {
  const { apiKey, chatbotId } = getRobofyConfig()

  if (!apiKey) return { configured: false, sessions: [], error: null }
  if (!chatbotId) {
    return { configured: false, sessions: [], error: 'Robofy chatbot ID is not configured.' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ROBOFY_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${ROBOFY_API_BASE}/v1/ai-agent/inbox/sessions/${encodeURIComponent(chatbotId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      return {
        configured: true,
        sessions: [],
        error: `Robofy inbox request failed (${response.status}). Check the API key and chatbot ID.`,
      }
    }

    const body = (await response.json()) as unknown
    const values = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray((body as { sessions?: unknown }).sessions)
        ? (body as { sessions: unknown[] }).sessions
        : []

    return {
      configured: true,
      sessions: values
        .slice(0, MAX_INBOX_SESSIONS)
        .map((value) => mapSession(value, apiKey))
        .filter((session): session is RobofyInboxSession => Boolean(session)),
      error: null,
    }
  } catch {
    const error = controller.signal.aborted
      ? 'Robofy inbox request timed out. Try again shortly.'
      : 'Robofy could not be reached. Try again shortly.'
    return { configured: true, sessions: [], error }
  } finally {
    clearTimeout(timeoutId)
  }
}
