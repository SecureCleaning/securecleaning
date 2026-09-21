import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getMenuSettingsActor } from '@/lib/menuSettingsAuth'
import { getMenuSettings, saveMenuSettings, MenuSettingsConflict } from '@/lib/menuSettings'
import { filterMenuLayout, menuDestinations, parseMenuConfiguration } from '@/lib/menuConfiguration'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  try {
    const actor = await getMenuSettingsActor(getAdminSessionIdentityFromRequest(request))
    if (!actor) return NextResponse.json({ error: 'Staff login required.' }, { status: 401, headers })
    if (request.nextUrl.searchParams.get('edit') === '1') {
      if (actor.role !== 'owner') return NextResponse.json({ error: 'Only an owner can configure menus.' }, { status: 403, headers })
      return NextResponse.json(await getMenuSettings(), { headers })
    }
    const settings = await getMenuSettings()
    const audience = actor.role === 'agent' ? 'agent' : 'admin'
    const allowedIds = menuDestinations(audience, actor.role, actor.availabilityAssigneeId ?? '').map(item => item.id)
    return NextResponse.json({ layout: filterMenuLayout(settings.config[audience], allowedIds), audience, role: actor.role, assigneeId: actor.availabilityAssigneeId }, { headers })
  } catch {
    return NextResponse.json({ error: 'Unable to load menus.' }, { status: 500, headers })
  }
}

export async function PUT(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 16384)
  if (blocked) return blocked
  try {
    const actor = await getMenuSettingsActor(getAdminSessionIdentityFromRequest(request))
    if (actor?.role !== 'owner') return NextResponse.json({ error: 'Only an active owner can configure menus.' }, { status: 403, headers })
    const limited = rateLimit(request, { key: `menu-settings:${actor.id}`, limit: 30, windowMs: 60_000 })
    if (limited) return limited
    let config, revision: string | null
    try {
      const text = await request.text()
      if (Buffer.byteLength(text) > 16384) return NextResponse.json({ error: 'Menu configuration is too large.' }, { status: 413, headers })
      const body = JSON.parse(text)
      config = parseMenuConfiguration(body?.config)
      if (body.revision !== null && (typeof body.revision !== 'string' || body.revision.length > 64 || !Number.isFinite(Date.parse(body.revision)))) throw new Error('Invalid menu revision. Reload the editor.')
      revision = body.revision
    } catch (error) {
      return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid menu configuration.' : error instanceof Error ? error.message : 'Invalid menu configuration.' }, { status: 400, headers })
    }
    return NextResponse.json(await saveMenuSettings(config, revision, actor.id), { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof MenuSettingsConflict ? error.message : 'Unable to save menus. Your changes have been kept in the editor.' }, { status: error instanceof MenuSettingsConflict ? 409 : 500, headers })
  }
}
