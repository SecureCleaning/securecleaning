import type { Metadata } from 'next'
import Link from 'next/link'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Cities We Service — Melbourne & Sydney',
  description: 'Secure Cleaning Aus operates in Melbourne and Sydney. Find your local Owner-Operator.',
}

export default async function CitiesPage() {
  const content = await getPublicContentMap()

  return (
    <div className="min-h-screen py-16 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>{getContentValue(content, 'cities.hero_title', 'Cities We Service')}</h1>
          <p className="text-lg text-gray-600">
            {getContentValue(content, 'cities.hero_subtitle', 'Currently operating in Melbourne and Sydney, with more cities coming soon.')}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[
            {
              city: 'melbourne',
              name: 'Melbourne',
              icon: '🏙️',
              desc: getContentValue(content, 'cities.melbourne_desc', 'CBD, inner suburbs, and greater metro area. Owner-Operators across all Melbourne zones including St Kilda, Richmond, Fitzroy, Docklands, Southbank, and the eastern/western/northern/southeastern suburbs.'),
              label: getContentValue(content, 'cities.melbourne_label', 'View Melbourne →'),
            },
            {
              city: 'sydney',
              name: 'Sydney',
              icon: '🌉',
              desc: getContentValue(content, 'cities.sydney_desc', 'CBD, North Shore, Eastern Suburbs, Western Sydney, Parramatta, and surrounding areas. Fully covered by our network of verified Owner-Operators.'),
              label: getContentValue(content, 'cities.sydney_label', 'View Sydney →'),
            },
          ].map(({ city, name, icon, desc, label }) => (
            <Link key={city} href={`/cities/${city}`}
              className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-8 hover:shadow-md transition-shadow">
              <div className="text-5xl mb-4">{icon}</div>
              <h2 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>{name}</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-5">{desc}</p>
              <span className="text-green-600 font-semibold text-sm">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
