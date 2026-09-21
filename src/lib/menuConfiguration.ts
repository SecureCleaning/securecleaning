import type { AdminRole } from '@/lib/staffAccounts'

export type MenuAudience = 'admin' | 'agent'
export type MenuLink = { kind: 'link'; id: string }
export type MenuGroup = { kind: 'group'; id: string; label: string; children: string[] }
export type MenuLayout = { items: Array<MenuLink | MenuGroup>; hidden: string[] }
export type MenuConfiguration = { version: 1; admin: MenuLayout; agent: MenuLayout }
export type MenuDestination = { id: string; label: string; href: string; roles?: AdminRole[] }

export const MENU_CATALOG: Record<MenuAudience, MenuDestination[]> = {
  admin: [
    { id: 'overview', label: 'Overview', href: '/admin' },
    { id: 'invoices', label: 'Invoices', href: '/admin/invoices', roles: ['owner', 'manager'] },
    { id: 'clients', label: 'Clients', href: '/admin/clients', roles: ['owner', 'manager'] },
    { id: 'products', label: 'Products', href: '/admin/products', roles: ['owner', 'manager'] },
    { id: 'sales', label: 'Product Sales', href: '/admin/sales', roles: ['owner', 'manager'] },
    { id: 'commissions', label: 'Commissions', href: '/admin/commissions', roles: ['owner'] },
    { id: 'availability', label: 'Availability', href: '/admin/availability' },
    { id: 'calendar', label: 'Calendar', href: '/admin/calendar' },
    { id: 'cleaners', label: 'Cleaners', href: '/admin/cleaners' },
    { id: 'pricing', label: 'Pricing & Rooms', href: '/admin/room-types' },
    { id: 'content', label: 'Content', href: '/admin/content' },
    { id: 'chat', label: 'Chat', href: '/admin/chat' },
    { id: 'staff', label: 'Team Access', href: '/admin/staff', roles: ['owner'] },
    { id: 'menus', label: 'Menu configuration', href: '/admin/menus', roles: ['owner'] },
  ],
  agent: [
    { id: 'portal', label: 'Agent portal', href: '/agent' },
    { id: 'invoices', label: 'Invoices', href: '/availability/invoices/{assigneeId}' },
    { id: 'quotes', label: 'My quotes', href: '/availability/quotes/{assigneeId}' },
    { id: 'clients', label: 'My clients', href: '/availability/clients/{assigneeId}' },
    { id: 'products', label: 'Products', href: '/availability/products/{assigneeId}' },
    { id: 'sales', label: 'Product sales', href: '/availability/sales/{assigneeId}' },
    { id: 'availability', label: 'My availability', href: '/availability/quoters/{assigneeId}' },
    { id: 'cleaners', label: 'Cleaners', href: '/availability/cleaners/{assigneeId}' },
    { id: 'commissions', label: 'Commissions', href: '/availability/commissions/{assigneeId}' },
    { id: 'home', label: 'Secure Cleaning home', href: '/' },
  ],
}

const link = (id: string): MenuLink => ({ kind: 'link', id })
export function defaultMenuConfiguration(): MenuConfiguration {
  return {
    version: 1,
    admin: { items: [link('overview'), link('invoices'), link('clients'), link('calendar'),
      { kind: 'group', id: 'sales-group', label: 'Sales', children: ['products', 'sales', 'commissions'] },
      { kind: 'group', id: 'operations-group', label: 'Operations', children: ['availability', 'cleaners'] },
      { kind: 'group', id: 'settings-group', label: 'Settings', children: ['pricing', 'content', 'chat', 'staff', 'menus'] },
    ], hidden: [] },
    agent: { items: [link('portal'), link('invoices'), link('quotes'), link('clients'),
      { kind: 'group', id: 'sales-group', label: 'Sales', children: ['products', 'sales', 'commissions'] },
      { kind: 'group', id: 'operations-group', label: 'Operations', children: ['availability', 'cleaners', 'home'] },
    ], hidden: [] },
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function parseMenuConfiguration(value: unknown): MenuConfiguration {
  if (!record(value) || value.version !== 1) throw new Error('Invalid menu configuration.')
  function parseLayout(audience: MenuAudience): MenuLayout {
    const candidate = (value as Record<string, unknown>)[audience]
    const catalog = MENU_CATALOG[audience]
    if (!record(candidate) || !Array.isArray(candidate.items) || !Array.isArray(candidate.hidden)
      || candidate.items.length > catalog.length + 8 || candidate.hidden.length > catalog.length) {
      throw new Error('Invalid menu layout.')
    }
    const destinations = new Set(catalog.map(item => item.id))
    const used = new Set<string>(), groups = new Set<string>(), labels = new Set<string>()
    function destination(id: unknown): string {
      if (typeof id !== 'string' || !destinations.has(id) || used.has(id)) throw new Error('Every menu link must appear exactly once.')
      used.add(id)
      return id
    }
    const items = candidate.items.map((item): MenuLink | MenuGroup => {
      if (!record(item)) throw new Error('Invalid menu item.')
      if (item.kind === 'link') return link(destination(item.id))
      if (item.kind !== 'group' || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,59}$/.test(item.id)
        || ['top', 'hidden'].includes(item.id) || destinations.has(item.id) || groups.has(item.id) || typeof item.label !== 'string'
        || !Array.isArray(item.children) || item.children.length > catalog.length) throw new Error('Invalid dropdown group.')
      const label = item.label.trim()
      if (!label || label.length > 30 || /[<>\x00-\x1f\x7f]/.test(label) || labels.has(label.toLowerCase())) throw new Error('Give each dropdown a unique name of 1 to 30 characters.')
      groups.add(item.id); labels.add(label.toLowerCase())
      if (groups.size > 8) throw new Error('Use no more than eight dropdowns.')
      return { kind: 'group', id: item.id, label, children: item.children.map(destination) }
    })
    const hidden = candidate.hidden.map(destination)
    if (used.size !== catalog.length) throw new Error('Some menu links are missing. Reload the editor and try again.')
    if (audience === 'admin' && hidden.includes('menus')) throw new Error('Keep Menu configuration visible so you can edit the menu again.')
    if (!items.some(item => item.kind === 'link' || item.children.length)) throw new Error('Keep at least one menu link visible.')
    return { items, hidden }
  }
  return { version: 1, admin: parseLayout('admin'), agent: parseLayout('agent') }
}

export function menuDestinations(audience: MenuAudience, role: AdminRole, assigneeId = '') {
  if (audience === 'admin' && role === 'agent') return []
  return MENU_CATALOG[audience].filter(item => (!item.roles || item.roles.includes(role))
    && (!item.href.includes('{assigneeId}') || Boolean(assigneeId)))
    .map(item => ({ ...item, href: item.href.replace('{assigneeId}', encodeURIComponent(assigneeId)) }))
}

export function isMenuDestinationActive(currentPath: string, href: string) {
  if (href === '/admin') return currentPath === href || currentPath.startsWith('/admin/quotes/')
  if (href === '/' || href === '/agent') return currentPath === href
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function filterMenuLayout(layout: MenuLayout, allowedIds: string[]): MenuLayout {
  const allowed = new Set(allowedIds)
  return { items: layout.items.flatMap<MenuLink | MenuGroup>(item => {
    if (item.kind === 'link') return allowed.has(item.id) ? [item] : []
    const children = item.children.filter(id => allowed.has(id))
    return children.length ? [{ ...item, children }] : []
  }), hidden: layout.hidden.filter(id => allowed.has(id)) }
}

export function moveMenuLink(layout: MenuLayout, id: string, placement: string): MenuLayout {
  const next: MenuLayout = { items: layout.items.filter(item => item.kind !== 'link' || item.id !== id)
    .map(item => item.kind === 'group' ? { ...item, children: item.children.filter(child => child !== id) } : item),
  hidden: layout.hidden.filter(child => child !== id) }
  if (placement === 'hidden') next.hidden.push(id)
  else if (placement === 'top') next.items.push(link(id))
  else {
    const group = next.items.find(item => item.kind === 'group' && item.id === placement)
    if (!group || group.kind !== 'group') return layout
    group.children.push(id)
  }
  return next
}
