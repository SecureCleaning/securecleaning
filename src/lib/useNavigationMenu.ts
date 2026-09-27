'use client'

import { useEffect, useState } from 'react'
import { defaultMenuConfiguration, menuDestinations, type MenuAudience, type MenuLayout } from '@/lib/menuConfiguration'
import type { AdminRole } from '@/lib/staffAccounts'

export const MENU_SETTINGS_CHANGED = 'securecleaning:menus-changed'
export function useNavigationMenu(audience: MenuAudience, assigneeId = '') {
  const key = `${audience}:${assigneeId}`
  const [resolved, setResolved] = useState<{ key: string; settings: { layout: MenuLayout; role: AdminRole } | null } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let sequence = 0
    async function load() {
      const current = ++sequence
      try {
        const response = await fetch('/api/menu-settings', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load menu settings.')
        const data = await response.json()
        if (data.audience !== audience || (audience === 'agent' && data.assigneeId !== assigneeId)) throw new Error('Menu settings do not match this portal.')
        if (current === sequence && !controller.signal.aborted) setResolved({ key, settings: data })
      } catch {
        if (current === sequence && !controller.signal.aborted) setResolved({ key, settings: null })
      }
    }
    void load()
    const refresh = () => { void load() }
    window.addEventListener(MENU_SETTINGS_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener(MENU_SETTINGS_CHANGED, refresh); window.removeEventListener('focus', refresh) }
  }, [audience, assigneeId, key])
  const ready = resolved?.key === key
  const settings = ready ? resolved.settings : null
  return {
    layout: settings?.layout ?? defaultMenuConfiguration()[audience],
    destinations: menuDestinations(audience, settings?.role ?? (audience === 'agent' ? 'agent' : 'viewer'), assigneeId),
    loading: !ready,
  }
}
