import Link from 'next/link'

const primaryTabs = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/sales', label: 'Product Sales' },
  { href: '/admin/availability', label: 'Availability' },
  { href: '/admin/calendar', label: 'Calendar' },
  { href: '/admin/cleaners', label: 'Cleaners' },
]

const secondaryTabs = [
  { href: '/admin/room-types', label: 'Pricing & Rooms' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/chat', label: 'Chat' },
  { href: '/admin/staff', label: 'Team Access' },
]

function isTabActive(currentPath: string, href: string) {
  return href === '/admin'
    ? currentPath === '/admin' || currentPath.startsWith('/admin/quotes/')
    : currentPath === href || currentPath.startsWith(`${href}/`)
}

export default function AdminNav({ currentPath }: { currentPath: string }) {
  const secondaryActive = secondaryTabs.some((tab) => isTabActive(currentPath, tab.href))

  return (
    <nav aria-label="Admin navigation" className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
      {primaryTabs.map((tab) => {
        const isActive = isTabActive(currentPath, tab.href)
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
      <details className="group relative">
        <summary
          className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden ${
            secondaryActive
              ? 'bg-green-600 text-white'
              : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          More <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">v</span>
        </summary>
        <div className="absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {secondaryTabs.map((tab) => {
            const isActive = isTabActive(currentPath, tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`block rounded-lg px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </details>
      </div>
    </nav>
  )
}
