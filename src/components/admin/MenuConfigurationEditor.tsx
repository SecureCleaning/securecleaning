'use client'

import { useCallback, useEffect, useState } from 'react'
import ConfigurableNavigation from '@/components/navigation/ConfigurableNavigation'
import { defaultMenuConfiguration, MENU_CATALOG, menuDestinations, moveMenuLink, parseMenuConfiguration, type MenuAudience, type MenuConfiguration, type MenuGroup, type MenuLayout } from '@/lib/menuConfiguration'
import { MENU_SETTINGS_CHANGED } from '@/lib/useNavigationMenu'

const button = 'min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-green-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700 disabled:opacity-40'
const field = 'min-h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900'
type Settings = { config: MenuConfiguration; revision: string | null; recovered: boolean }

export default function MenuConfigurationEditor() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<MenuConfiguration | null>(null)
  const [audience, setAudience] = useState<MenuAudience>('admin')
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dirty = Boolean(saved && draft && JSON.stringify(saved.config) !== JSON.stringify(draft))
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/menu-settings?edit=1', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load menu configuration.')
      const settings = { ...result, config: parseMenuConfiguration(result.config) } as Settings
      setSaved(settings); setDraft(settings.config)
      setMessage(settings.recovered ? 'The stored layout could not be read. Default menus are shown; save to replace the damaged layout.' : '')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load menu configuration.') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      if (anchor && !anchor.closest('[data-menu-preview]') && !window.confirm('Leave without saving your menu changes?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
  async function save() {
    if (!draft || !saved) return
    setBusy(true); setError(''); setMessage('')
    try {
      const config = parseMenuConfiguration(draft)
      const response = await fetch('/api/menu-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, revision: saved.revision }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save menus.')
      setSaved(result); setDraft(result.config)
      setMessage('Menus saved. The admin menu and agents\' menu are now updated.')
      window.dispatchEvent(new Event(MENU_SETTINGS_CHANGED))
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save menus.') }
    finally { setBusy(false) }
  }
  function update(layout: MenuLayout) {
    if (!draft) return
    setDraft({ ...draft, [audience]: layout }); setMessage('Unsaved menu changes.'); setError('')
  }
  if (!draft) return <section className="rounded-xl border border-gray-200 bg-white p-6"><h1 className="text-2xl font-bold text-gray-900">Menu configuration</h1>{error ? <p role="alert" className="my-4 text-red-700">{error}</p> : <p role="status" className="my-4">Loading menus...</p>}<button type="button" className={button} disabled={busy} onClick={() => void load()}>Retry</button></section>
  const layout = draft[audience]
  const groups = layout.items.filter((item): item is MenuGroup => item.kind === 'group')
  const labelFor = (id: string) => MENU_CATALOG[audience].find(item => item.id === id)?.label ?? id
  function move(index: number, offset: number, parent?: string) {
    const next = structuredClone(layout)
    const group = next.items.find(item => item.kind === 'group' && item.id === parent)
    const list = parent && group?.kind === 'group' ? group.children : next.items
    const target = index + offset
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    update(next)
    setMessage('Menu order updated. Save when ready.')
  }
  const ordering = (index: number, length: number, name: string, parent?: string) => <div className="flex shrink-0 gap-1">
    <button type="button" className={button} disabled={busy || index === 0} aria-label={`Move ${name} up`} onClick={() => move(index, -1, parent)}>Up</button>
    <button type="button" className={button} disabled={busy || index === length - 1} aria-label={`Move ${name} down`} onClick={() => move(index, 1, parent)}>Down</button>
  </div>
  const placement = (id: string, current: string) => <label className="min-w-0 text-xs text-gray-600">Placement<select aria-label={`Placement of ${labelFor(id)}`} className={field} value={current} disabled={busy} onChange={event => update(moveMenuLink(layout, id, event.target.value))}>
    <option value="top">Top menu</option>{groups.map(group => <option key={group.id} value={group.id}>{group.label || 'Unnamed dropdown'}</option>)}{id !== 'menus' && <option value="hidden">Hidden</option>}
  </select></label>
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Menu configuration</h1><p className="mt-1 text-sm text-gray-600">Arrange the shared admin menu and the menu used by your agents. Access permissions stay the same.</p></div><button type="button" disabled={!dirty || busy} onClick={() => void save()} className="min-h-10 rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-40">{busy ? 'Saving...' : 'Save menus'}</button></div>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-gray-700">Editing<select className={field} value={audience} disabled={busy} onChange={event => { setAudience(event.target.value as MenuAudience); setGroupName('') }}><option value="admin">Admin menu (my menu)</option><option value="agent">Agents&apos; menu</option></select></label><button type="button" className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes to both menus and reload?')) void load() }}>Reload saved menus</button><button type="button" className={button} disabled={busy} onClick={() => { if (window.confirm('Reset this menu to its default layout? Save to apply it.')) update(defaultMenuConfiguration()[audience]) }}>Reset this menu</button></div>
    <div aria-live="polite" className="text-sm text-green-800">{message || (dirty ? 'Unsaved changes' : 'Saved menu layout')}</div>{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section data-menu-preview className="relative z-10 rounded-xl border border-green-200 bg-white p-4" onClickCapture={event => { if ((event.target as Element).closest('a')) event.preventDefault() }}><h2 className="mb-3 text-sm font-semibold text-gray-600">Live preview - {audience === 'admin' ? 'owner view' : 'agent view'}</h2><ConfigurableNavigation layout={layout} destinations={menuDestinations(audience, audience === 'admin' ? 'owner' : 'agent', 'preview')} currentPath="" label="Menu preview" /></section>
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold text-gray-900">Menu order</h2><p className="mb-4 text-sm text-gray-600">Move links or dropdowns up and down. Choose a placement to put a link inside a dropdown.</p>
      <div className="space-y-3">{layout.items.map((item, index) => <div key={item.id} className="rounded-xl border border-gray-200 p-3">
        {item.kind === 'link' ? <div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-sm text-gray-800">{labelFor(item.id)}</strong><div className="flex flex-wrap items-end gap-2">{placement(item.id, 'top')}{ordering(index, layout.items.length, labelFor(item.id))}</div></div> : <>
          <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 text-xs font-semibold text-gray-600">Dropdown name<input aria-label={`Dropdown name ${index + 1}`} className={field} maxLength={30} value={item.label} disabled={busy} onChange={event => update({ ...layout, items: layout.items.map(entry => entry.id === item.id ? { ...item, label: event.target.value } : entry) })} /></label><div className="flex flex-wrap gap-2">{ordering(index, layout.items.length, item.label)}<button type="button" className={button} disabled={busy} onClick={() => update({ ...layout, items: layout.items.flatMap(entry => entry.id === item.id ? item.children.map(id => ({ kind: 'link' as const, id })) : [entry]) })}>Remove dropdown</button></div></div>
          {item.children.length === 0 && <p className="mt-3 text-sm text-gray-500">Empty dropdowns do not appear in the menu. Move a link here to use it.</p>}
          <ul className="mt-3 divide-y divide-gray-100">{item.children.map((id, childIndex) => <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3 sm:pl-4"><span className="text-sm text-gray-800">{labelFor(id)}</span><div className="flex flex-wrap items-end gap-2">{placement(id, item.id)}{ordering(childIndex, item.children.length, labelFor(id), item.id)}</div></li>)}</ul>
        </>}
      </div>)}</div>
      <form className="mt-5 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); const name = groupName.trim(); if (!name) return; update({ ...layout, items: [...layout.items, { kind: 'group', id: `group-${crypto.randomUUID()}`, label: name, children: [] }] }); setGroupName('') }}><label className="min-w-0 text-sm font-semibold text-gray-700">New dropdown<input className={field} value={groupName} disabled={busy || groups.length >= 8} onChange={event => setGroupName(event.target.value)} maxLength={30} required placeholder="e.g. Operations" /></label><button className={button} disabled={busy || groups.length >= 8}>Add dropdown</button></form>
    </section>
    {layout.hidden.length > 0 && <section className="rounded-xl border border-gray-200 bg-white p-4"><h2 className="text-lg font-semibold">Hidden links</h2><ul className="divide-y divide-gray-100">{layout.hidden.map(id => <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{labelFor(id)}</span>{placement(id, 'hidden')}</li>)}</ul></section>}
    <p className="text-sm text-gray-600">Only owners can change these layouts. Some admin links appear only for permitted roles. Menu configuration remains available to owners.</p>
  </div>
}
