import { NextRequest, NextResponse } from 'next/server'
import {
  CONTENT_DEFAULTS,
  getAllContentEntries,
  upsertContentEntries,
} from '@/lib/content'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'

type ContentPayloadEntry = {
  key: string
  title: string
  content: string
  group_name: string
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entries = await getAllContentEntries()
  return NextResponse.json({ entries })
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const entries = Array.isArray(body?.entries) ? body.entries : null

    if (!entries) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const allowedKeys = new Set(CONTENT_DEFAULTS.map((entry) => entry.key))

    const sanitizedEntries = entries
      .filter(
        (
          entry: unknown
        ): entry is ContentPayloadEntry => {
          if (!entry || typeof entry !== 'object') {
            return false
          }

          const candidate = entry as Record<string, unknown>

          return (
            typeof candidate.key === 'string' &&
            typeof candidate.title === 'string' &&
            typeof candidate.content === 'string' &&
            typeof candidate.group_name === 'string' &&
            allowedKeys.has(candidate.key)
          )
        }
      )
      .map((entry: ContentPayloadEntry) => ({
        key: entry.key,
        title: entry.title.trim(),
        content: entry.content.trim(),
        group_name: entry.group_name.trim() || 'general',
      }))

    if (sanitizedEntries.length !== CONTENT_DEFAULTS.length) {
      return NextResponse.json({ error: 'Entries payload is incomplete or invalid.' }, { status: 400 })
    }

    const entriesByKey = new Map<string, ContentPayloadEntry>(
      sanitizedEntries.map((entry: ContentPayloadEntry) => [entry.key, entry] as const)
    )
    const orderedEntries = CONTENT_DEFAULTS.map((entry) => {
      const submittedEntry = entriesByKey.get(entry.key)
      return {
        key: entry.key,
        title: submittedEntry?.title ?? entry.title,
        content: submittedEntry?.content ?? entry.content,
        group_name: submittedEntry?.group_name ?? entry.group_name,
      }
    })

    const savedEntries = await upsertContentEntries(orderedEntries)

    return NextResponse.json({ entries: savedEntries })
  } catch (error) {
    console.error('[api/admin/content] Failed to save content:', error)
    return NextResponse.json({ error: 'Failed to save content.' }, { status: 500 })
  }
}
