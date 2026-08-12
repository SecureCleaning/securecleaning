const ROBOFY_API_BASE = 'https://agents.robofy.ai'

export type RobofyInboxSession = {
  sessionId: string
  lastMessageTime: string | null
  lastMessage: string | null
  visitorName: string | null
  lastMessageDirection: string | null
  websiteUrl: string | null
}

export type RobofyInboxResult = {
  configured: boolean
  sessions: RobofyInboxSession[]
  error: string | null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function getRobofyConfig() {
  return {
    apiKey: process.env.ROBOFY_API_KEY,
    chatbotId: process.env.ROBOFY_CHATBOT_ID || process.env.NEXT_PUBLIC_ROBOFY_CID,
  }
}

function mapSession(value: unknown): RobofyInboxSession | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const sessionId = asString(source.session_id)
  if (!sessionId) return null

  return {
    sessionId,
    lastMessageTime: asString(source.last_message_time),
    lastMessage: asString(source.last_message),
    visitorName: asString(source.user_profile_name),
    lastMessageDirection: asString(source.last_message_direction),
    websiteUrl: asString(source.website_url),
  }
}

export async function getRobofyInboxSessions(): Promise<RobofyInboxResult> {
  const { apiKey, chatbotId } = getRobofyConfig()

  if (!apiKey) return { configured: false, sessions: [], error: null }
  if (!chatbotId) {
    return { configured: false, sessions: [], error: 'Robofy chatbot ID is not configured.' }
  }

  try {
    const response = await fetch(
      `${ROBOFY_API_BASE}/v1/ai-agent/inbox/sessions/${encodeURIComponent(chatbotId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
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
      sessions: values.map(mapSession).filter((session): session is RobofyInboxSession => Boolean(session)),
      error: null,
    }
  } catch (error) {
    console.error('[robofyInbox] Failed to load Robofy sessions', error)
    return { configured: true, sessions: [], error: 'Robofy could not be reached. Try again shortly.' }
  }
}
