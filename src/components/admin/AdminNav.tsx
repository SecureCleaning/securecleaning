import Link from 'next/link'

const tabs = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/sites', label: 'Sites' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/products', label: 'Contract Products' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/room-types', label: 'Room Types' },
  { href: '/admin/availability', label: 'Availability' },
  { href: '/admin/calendar', label: 'Calendar' },
  { href: '/admin/cleaners', label: 'Cleaners' },
  { href: '/admin/chat', label: 'Chat' },
  { href: '/admin/staff', label: 'Team Access' },
]

export default function AdminNav({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Admin navigation" className="min-w-0 flex-1 overflow-x-auto">
      <div className="flex min-w-max gap-1.5 pb-1">
      {tabs.map((tab) => {
        const isActive = tab.href === '/admin'
          ? currentPath === '/admin' || currentPath.startsWith('/admin/quotes/')
          : currentPath === tab.href || currentPath.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
      </div>
    </nav>
  )
}
