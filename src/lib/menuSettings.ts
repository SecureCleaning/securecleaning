import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLogStrict } from '@/lib/auditLog'
import { defaultMenuConfiguration, parseMenuConfiguration, type MenuConfiguration } from '@/lib/menuConfiguration'

const SETTINGS_KEY = 'navigation.menus'
export class MenuSettingsConflict extends Error {}

export async function getMenuSettings() {
  const { data, error } = await getAdminSupabase().from('site_content').select('content, updated_at').eq('key', SETTINGS_KEY).maybeSingle()
  if (error) throw error
  let config = defaultMenuConfiguration()
  let recovered = false
  if (data) {
    try { config = parseMenuConfiguration(JSON.parse(data.content)) }
    catch { recovered = true }
  }
  return { config, revision: data?.updated_at as string | undefined ?? null, recovered }
}

export async function saveMenuSettings(config: MenuConfiguration, revision: string | null, actorId: string) {
  const validated = parseMenuConfiguration(config)
  const db = getAdminSupabase()
  // Only presentation metadata goes in site_content, which has a public read policy.
  const row = { key: SETTINGS_KEY, title: 'Staff navigation menus', content: JSON.stringify(validated), group_name: 'navigation', updated_at: new Date().toISOString() }
  await writeAuditLogStrict('navigation', SETTINGS_KEY, 'menu.save_requested', { actorId })
  const { data, error } = revision === null
    ? await db.from('site_content').insert(row).select('updated_at').single()
    : await db.from('site_content').update(row).eq('key', SETTINGS_KEY).eq('updated_at', revision).select('updated_at').maybeSingle()
  if (error?.code === '23505' || (!error && !data)) throw new MenuSettingsConflict('The menus changed in another session. Reload before saving again.')
  if (error) throw error
  return { config: validated, revision: data!.updated_at as string, recovered: false }
}
