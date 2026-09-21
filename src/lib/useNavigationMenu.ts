'use client'

import { useEffect, useState } from 'react'
import { defaultMenuConfiguration, menuDestinations, type MenuAudience, type MenuLayout } from '@/lib/menuConfiguration'
import type { AdminRole } from '@/lib/staffAccounts'

export const MENU_SETTINGS_CHANGED = 'securecleaning:menus-changed'
export function useNavigationMenu(audience: MenuAudience, assigneeId = '') {
  const [settings, setSettings] = useState<{ layout: MenuLayout; role: AdminRole } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let sequence = 0
    async function load() {
      const current = ++sequence
      try {
        const response = await fetch('/api/menu-settings', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        if (current === sequence && !controller.signal.aborted && data.audience === audience && (audience !== 'agent' || data.assigneeId === assigneeId)) setSettings(data)
      } catch { /* Keep default navigation available during connection failures. */ }
    }
    void load()
    const refresh = () => { void load() }
    window.addEventListener(MENU_SETTINGS_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener(MENU_SETTINGS_CHANGED, refresh); window.removeEventListener('focus', refresh) }
  }, [audience, assigneeId])
  return { layout: settings?.layout ?? defaultMenuConfiguration()[audience], destinations: menuDestinations(audience, settings?.role ?? (audience === 'agent' ? 'agent' : 'viewer'), assigneeId) }
}
