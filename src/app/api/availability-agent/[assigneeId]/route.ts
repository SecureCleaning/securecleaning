import { NextRequest, NextResponse } from 'next/server'
import {
  AvailabilityConfig,
  OneOffAvailabilityBlock,
  WeeklyAvailabilitySlot,
  getAvailabilityConfig,
  getAvailabilityAssignee,
  saveAvailabilityConfig,
} from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

function sanitizeAgentSlots(
  slots: unknown,
  assigneeId: string,
  fallbackCity: 'melbourne' | 'sydney',
  allowedZoneIds: Set<string>
): WeeklyAvailabilitySlot[] {
  if (!Array.isArray(slots)) return []

  return slots.map((slot, index) => {
    const source = typeof slot === 'object' && slot ? (slot as Partial<WeeklyAvailabilitySlot>) : {}
    return {
      id: String(source.id ?? `slot-${assigneeId}-${index + 1}`),
      city: source.city === 'sydney' ? 'sydney' : fallbackCity,
      assigneeId,
      label: String(source.label ?? `Slot ${index + 1}`),
      day: (source.day ?? 'monday') as WeeklyAvailabilitySlot['day'],
      startTime: String(source.startTime ?? '09:00'),
      endTime: String(source.endTime ?? '10:00'),
      zoneIds: Array.isArray(source.zoneIds)
        ? source.zoneIds.map((zoneId) => String(zoneId)).filter((zoneId) => allowedZoneIds.has(zoneId))
        : [],
      active: Boolean(source.active ?? true),
      notes: typeof source.notes === 'string' ? source.notes : '',
    }
  })
}

function sanitizeAgentBlocks(blocks: unknown, assigneeId: string): OneOffAvailabilityBlock[] {
  if (!Array.isArray(blocks)) return []

  return blocks.map((block, index) => {
    const source = typeof block === 'object' && block ? (block as Partial<OneOffAvailabilityBlock>) : {}
    return {
      id: String(source.id ?? `block-${assigneeId}-${index + 1}`),
      assigneeId,
      startsAt: String(source.startsAt ?? ''),
      endsAt: String(source.endsAt ?? ''),
      label: String(source.label ?? `Block ${index + 1}`),
      active: Boolean(source.active ?? true),
    }
  })
}

function applyAgentAvailabilityUpdates(
  config: AvailabilityConfig,
  assigneeId: string,
  weeklySlots: WeeklyAvailabilitySlot[],
  oneOffBlocks: OneOffAvailabilityBlock[]
) {
  return {
    ...config,
    weeklySlots: [
      ...config.weeklySlots.filter((slot) => slot.assigneeId !== assigneeId),
      ...weeklySlots,
    ],
    oneOffBlocks: [
      ...config.oneOffBlocks.filter((block) => block.assigneeId !== assigneeId),
      ...oneOffBlocks,
    ],
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const blocked = rateLimit(request, { key: 'availability-agent-read:minute', limit: 60, windowMs: 60 * 1000 })
  if (blocked) return blocked

  const { assigneeId } = await context.params

  const isAdmin = isAuthorizedAdminRequest(request)
  const isAgent = await isAuthorizedAvailabilityAgentRequest(request, assigneeId)

  if (!isAdmin && !isAgent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  if (!assignee) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  }

  return NextResponse.json({
    assignee,
    weeklySlots: config.weeklySlots.filter((slot) => slot.assigneeId === assigneeId),
    oneOffBlocks: config.oneOffBlocks.filter((block) => block.assigneeId === assigneeId),
    zones: config.zones.filter((zone) => zone.city === assignee.city),
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assigneeId: string }> }
) {
  const blocked =
    rejectCrossOriginMutation(request) ??
    rejectLargePayload(request, 64 * 1024) ??
    rateLimit(request, { key: 'availability-agent-save:minute', limit: 20, windowMs: 60 * 1000 })
  if (blocked) return blocked

  const { assigneeId } = await context.params

  const isAdmin = isAuthorizedAdminRequest(request)
  const isAgent = await isAuthorizedAvailabilityAgentRequest(request, assigneeId)

  if (!isAdmin && !isAgent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, assigneeId)

    if (!assignee) {
      return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
    }

    const allowedZoneIds = new Set(
      config.zones.filter((zone) => zone.city === assignee.city).map((zone) => zone.id)
    )
    const weeklySlots = sanitizeAgentSlots(body?.weeklySlots, assigneeId, assignee.city, allowedZoneIds)
    const oneOffBlocks = sanitizeAgentBlocks(body?.oneOffBlocks, assigneeId)

    const nextConfig = applyAgentAvailabilityUpdates(config, assigneeId, weeklySlots, oneOffBlocks)
    const savedConfig = await saveAvailabilityConfig(nextConfig)

    return NextResponse.json({
      success: true,
      assignee: getAvailabilityAssignee(savedConfig, assigneeId),
      weeklySlots: savedConfig.weeklySlots.filter((slot) => slot.assigneeId === assigneeId),
      oneOffBlocks: savedConfig.oneOffBlocks.filter((block) => block.assigneeId === assigneeId),
      zones: savedConfig.zones.filter((zone) => zone.city === assignee.city),
    })
  } catch (error) {
    console.error('[api/availability-agent] Failed to save agent availability:', error)
    return NextResponse.json({ error: 'Failed to save agent availability.' }, { status: 500 })
  }
}
