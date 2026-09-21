'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { isMenuDestinationActive, type MenuDestination, type MenuLayout } from '@/lib/menuConfiguration'

export default function ConfigurableNavigation({ layout, destinations, currentPath, label }: {
  layout: MenuLayout; destinations: MenuDestination[]; currentPath: string; label: string
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const root = useRef<HTMLElement>(null)
  const prefix = useId()
  const byId = new Map(destinations.map(item => [item.id, item]))
  const active = destinations.find(item => isMenuDestinationActive(currentPath, item.href))
  useEffect(() => { setOpenGroup(null); setMobileOpen(false) }, [currentPath])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpenGroup(null); setMobileOpen(false) }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  const pill = 'inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700'
  const tone = (selected: boolean) => selected ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-green-600 hover:bg-green-50'
  return <nav ref={root} aria-label={label} className="relative min-w-0 flex-1" onKeyDown={event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (openGroup) { document.getElementById(`${prefix}-${openGroup}-trigger`)?.focus(); setOpenGroup(null) }
      else { setMobileOpen(false); document.getElementById(`${prefix}-mobile`)?.focus() }
    }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenGroup(null) }}>
    <button id={`${prefix}-mobile`} type="button" aria-expanded={mobileOpen} aria-controls={`${prefix}-links`} onClick={() => setMobileOpen(!mobileOpen)} className={`${pill} ${tone(false)} sm:hidden`}>
      Menu <span className="truncate font-normal">{active?.label ?? ''}</span><span aria-hidden="true">{mobileOpen ? '-' : '+'}</span>
    </button>
    <ul id={`${prefix}-links`} className={`${mobileOpen ? 'flex' : 'hidden'} mt-2 max-h-[60dvh] flex-col gap-1.5 overflow-y-auto sm:mt-0 sm:flex sm:max-h-none sm:flex-row sm:flex-wrap sm:items-center sm:overflow-visible`}>
      {layout.items.map(item => {
        if (item.kind === 'link') {
          const destination = byId.get(item.id)
          if (!destination) return null
          const selected = isMenuDestinationActive(currentPath, destination.href)
          return <li key={item.id}><Link href={destination.href} aria-current={selected ? 'page' : undefined} onClick={() => { setOpenGroup(null); setMobileOpen(false) }} className={`${pill} ${tone(selected)}`}>{destination.label}</Link></li>
        }
        const children = item.children.map(id => byId.get(id)).filter((entry): entry is MenuDestination => Boolean(entry))
        if (!children.length) return null
        const expanded = openGroup === item.id
        const selected = children.some(child => isMenuDestinationActive(currentPath, child.href))
        return <li key={item.id} className="min-w-0">
          <button id={`${prefix}-${item.id}-trigger`} type="button" aria-expanded={expanded} aria-controls={`${prefix}-${item.id}-panel`} className={`${pill} ${tone(selected)}`} onClick={() => setOpenGroup(expanded ? null : item.id)} onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpenGroup(item.id); requestAnimationFrame(() => document.getElementById(`${prefix}-${item.id}-panel`)?.querySelector('a')?.focus()) }
          }}><span className="break-words">{item.label}</span><span aria-hidden="true" className={`text-xs ${expanded ? 'rotate-180' : ''}`}>v</span></button>
          <div id={`${prefix}-${item.id}-panel`} hidden={!expanded} className="z-50 mt-2 rounded-xl border border-green-200 bg-white p-2 shadow-lg sm:absolute sm:inset-x-0">
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{children.map(child => {
              const selected = isMenuDestinationActive(currentPath, child.href)
              return <li key={child.id}><Link href={child.href} aria-current={selected ? 'page' : undefined} onClick={() => { setOpenGroup(null); setMobileOpen(false) }} className={`block rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700 ${selected ? 'bg-green-100 text-green-900' : 'text-gray-700 hover:bg-green-50 hover:text-green-900'}`}>{child.label}</Link></li>
            })}</ul>
          </div>
        </li>
      })}
    </ul>
  </nav>
}
