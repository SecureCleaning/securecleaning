import { NextRequest, NextResponse } from 'next/server'
import { toBrowserAvailabilityConfig, getAvailabilityConfig, saveAvailabilityConfig, validateAvailabilityZoneConfig } from '@/lib/availability'
import { hashAvailabilityAccessCode } from '@/lib/availabilityAccessCode'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getAdminSupabase } from '@/lib/supabase'
import { validateOwnerOperatorLinks } from '@/lib/availabilityLinkage'

export async function GET(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getAvailabilityConfig()
  return NextResponse.json({ config: toBrowserAvailabilityConfig(config) })
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedAdminRequest(request, 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const config = body?.config
    const draftAccessCodes = body?.draftAccessCodes

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Invalid availability config.' }, { status: 400 })
    }
    const zoneConfigError = validateAvailabilityZoneConfig(config)
    if (zoneConfigError) return NextResponse.json({ error: zoneConfigError }, { status: 400 })

    if (Array.isArray(config.assignees)) {
      const usernames: string[] = config.assignees.map((assignee: { username?: string }) =>
        String(assignee.username ?? '').trim().toLowerCase()
      )
      if (usernames.some((username: string) => !username)) {
        return NextResponse.json({ error: 'Every agent must have a username.' }, { status: 400 })
      }

      const uniqueUsernames = new Set(usernames)
      if (uniqueUsernames.size !== usernames.length) {
        return NextResponse.json({ error: 'Agent usernames must be unique.' }, { status: 400 })
      }
    }

    const existing = await getAvailabilityConfig()
    const nextConfig = {
      ...config,
      assignees: Array.isArray(config.assignees) ? config.assignees.map((assignee: { id: string; calendarId?: string; calendarSubscriptionUrl?: string }) => {
        const previous = existing.assignees.find((item) => item.id === assignee.id)
        const code = typeof draftAccessCodes?.[assignee.id] === 'string' ? draftAccessCodes[assignee.id].trim() : ''
        return { ...assignee, calendarId: assignee.calendarId?.trim() || previous?.calendarId,
          calendarSubscriptionUrl: assignee.calendarSubscriptionUrl?.trim() || previous?.calendarSubscriptionUrl,
          accessCodeHash: code ? hashAvailabilityAccessCode(code) : previous?.accessCodeHash }
      }) : [],
    }

    const db = getAdminSupabase()
    const { data: ownerOperators, error: ownerOperatorsError } = await db
      .from('owner_operators')
      .select('id, city, is_active')
    if (ownerOperatorsError) throw ownerOperatorsError

    const linkageError = validateOwnerOperatorLinks(nextConfig, ownerOperators ?? [])
    if (linkageError) {
      return NextResponse.json({ error: linkageError }, { status: 400 })
    }

    const savedConfig = await saveAvailabilityConfig(nextConfig)
    return NextResponse.json({ config: toBrowserAvailabilityConfig(savedConfig) })
  } catch (error) {
    console.error('[api/admin/availability] Failed to save availability config:', error)
    return NextResponse.json({ error: 'Failed to save availability config.' }, { status: 500 })
  }
}
