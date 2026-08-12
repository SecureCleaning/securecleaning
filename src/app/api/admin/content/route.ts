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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entries = await getAllContentEntries()
  return NextResponse.json({ entries })
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const entries = isRecord(body) && Array.isArray(body.entries) ? body.entries : null

  if (!entries) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (entries.length !== CONTENT_DEFAULTS.length) {
    return NextResponse.json({ error: 'Entries payload is incomplete or invalid.' }, { status: 400 })
  }

  const allowedKeys = new Set(CONTENT_DEFAULTS.map((entry) => entry.key))
  const submittedKeys = new Set<string>()
  const sanitizedEntries: ContentPayloadEntry[] = []

  for (const entry of entries) {
    if (!isRecord(entry)) {
      return NextResponse.json({ error: 'Entries payload is incomplete or invalid.' }, { status: 400 })
    }

    const { key, title, content, group_name } = entry

    if (
      typeof key !== 'string' ||
      typeof title !== 'string' ||
      typeof content !== 'string' ||
      typeof group_name !== 'string' ||
      !allowedKeys.has(key) ||
      submittedKeys.has(key)
    ) {
      return NextResponse.json({ error: 'Entries payload is incomplete or invalid.' }, { status: 400 })
    }

    submittedKeys.add(key)
    sanitizedEntries.push({
      key,
      title: title.trim(),
      content: content.trim(),
      group_name: group_name.trim() || 'general',
    })
  }

  if (submittedKeys.size !== allowedKeys.size) {
    return NextResponse.json({ error: 'Entries payload is incomplete or invalid.' }, { status: 400 })
  }

  try {
    const entriesByKey = new Map<string, ContentPayloadEntry>(
      sanitizedEntries.map((entry) => [entry.key, entry] as const)
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
