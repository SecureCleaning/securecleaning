import Link from 'next/link'

const tabs = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/sites', label: 'Sites' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/availability', label: 'Availability' },
]

export default function AdminNav({ currentPath }: { currentPath: string }) {
  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {tabs.map((tab) => {
        const isActive = currentPath === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
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
  )
}
