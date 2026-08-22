import type { Metadata } from 'next'
import Link from 'next/link'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Commercial Cleaning Services',
  description:
    'Professional commercial cleaning for offices, medical centres, childcare, retail, function centres, sports facilities, and gyms in Melbourne and Sydney.',
  alternates: { canonical: '/services' },
}

const serviceDefaults = [
  {
    id: 'office',
    contentPrefix: 'item_1',
    icon: '🏢',
    title: 'Office Cleaning',
    description:
      'Regular or daily cleaning for offices, co-working spaces, corporate suites, and professional workplaces of all sizes. Includes desks, meeting rooms, kitchens, toilets, and common areas.',
    features: ['Open-plan workspace cleaning', 'Meeting room servicing', 'Kitchen and breakout areas', 'Bathroom and toilet cleaning', 'Bin emptying and waste management', 'Glass and mirror polishing'],
  },
  {
    id: 'medical',
    contentPrefix: 'item_2',
    icon: '🏥',
    title: 'Medical & Healthcare Cleaning',
    description:
      'Specialised clinical-grade cleaning for GP clinics, dental practices, allied health centres, physiotherapy studios, and other healthcare premises. Our operators understand infection control protocols.',
    features: ['Clinical surface disinfection', 'Cross-contamination prevention', 'Waiting room and reception cleaning', 'Treatment room preparation', 'Sharps bin area management', 'HACCP-aware practices'],
  },
  {
    id: 'childcare',
    contentPrefix: 'item_3',
    icon: '🎨',
    title: 'Childcare Centre Cleaning',
    description:
      'Safe, thorough cleaning for childcare centres, kindergartens, preschools, and OOSH services. We use child-safe products and understand the regulatory standards for early childhood environments.',
    features: ['Child-safe cleaning products only', 'Toy and surface sanitisation', 'Outdoor play area cleaning', 'Nappy change area disinfection', 'Compliance with ECA standards', 'After-hours cleaning available'],
  },
  {
    id: 'function_centre',
    contentPrefix: 'function_centres',
    icon: '🎟️',
    title: 'Function Centre Cleaning',
    description:
      'Reliable cleaning for function rooms, event venues, reception spaces, and hospitality areas before, during, and after events.',
    features: ['Event floor and venue cleaning', 'Pre-event and post-event cleaning', 'Bathrooms and amenities', 'Kitchen and service areas', 'Seating and public area cleaning', 'Waste and recycling management'],
  },
  {
    id: 'retail',
    contentPrefix: 'item_5',
    icon: '🛍️',
    title: 'Retail & Showroom Cleaning',
    description:
      'Presentation-focused cleaning for retail stores, showrooms, shopping strip tenancies, and boutique spaces. Create the right first impression for your customers every day.',
    features: ['Shop floor cleaning and mopping', 'Window and display cleaning', 'Counter and fitting room servicing', 'Entrance and foyer maintenance', 'Before-opening clean-ups', 'Stock room cleaning'],
  },
  {
    id: 'gym',
    contentPrefix: 'item_6',
    icon: '💪',
    title: 'Gym & Fitness Studio Cleaning',
    description:
      'Specialised cleaning for gyms, fitness studios, pilates studios, yoga centres, and leisure facilities. Our operators understand the importance of hygiene in high-contact exercise environments.',
    features: ['Equipment and machine wipe-down', 'Mat and floor sanitisation', 'Locker room and shower cleaning', 'Reception and foyer cleaning', 'Sweat and odour control', 'High-touch disinfection available'],
  },
  {
    id: 'sports_facility',
    contentPrefix: 'sports_facilities',
    icon: '⚽',
    title: 'Sports Facilities Cleaning',
    description:
      'Hygiene-focused cleaning for sporting clubs, recreation centres, training venues, courts, change rooms, and member facilities.',
    features: ['Courts, fields and activity areas', 'Change room and shower cleaning', 'Equipment and touchpoint disinfection', 'Reception and member areas', 'Amenities and bathroom servicing', 'Waste and floor care'],
  },
  {
    id: 'other',
    contentPrefix: 'item_8',
    icon: '🔧',
    title: 'Other Commercial Premises',
    description:
      'Have a unique or specialised commercial space? We work with a range of premises not covered by the categories above. Contact us to discuss your requirements.',
    features: ['Schools and education facilities', 'Places of worship', 'Event venues', 'Body corporate common areas', 'Government offices', 'And more…'],
  },
]

export default async function ServicesPage() {
  const content = await getPublicContentMap()
  const services = serviceDefaults.map((service) => {
    const prefix = service.contentPrefix
    return {
      ...service,
      title: getContentValue(content, `services.${prefix}_title`, service.title),
      description: getContentValue(content, `services.${prefix}_description`, service.description),
      features: getContentValue(content, `services.${prefix}_features`, service.features.join('\n'))
        .split(/\r?\n/)
        .map((feature) => feature.trim())
        .filter(Boolean),
    }
  })

  return (
    <div className="min-h-screen">
      <section className="py-12 text-white text-center" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{getContentValue(content, 'services.hero_title', 'Our Services')}</h1>
          <p className="text-xl text-gray-300 mb-8">
            {getContentValue(content, 'services.hero_subtitle', 'Specialised commercial cleaning for every type of premises. Melbourne and Sydney only. Owner-Operators who know your industry.')}
          </p>
          <Link href="/quote"
            className="inline-flex items-center px-8 py-4 rounded-lg font-bold text-white text-lg transition-all hover:opacity-90"
            style={{ backgroundColor: '#22c55e' }}>
            {getContentValue(content, 'services.hero_cta_label', 'Get an Instant Quote')}
          </Link>
        </div>
      </section>

      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
          {services.map((service) => (
            <div key={service.id} id={service.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="text-5xl shrink-0">{service.icon}</div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2" style={{ color: '#1a2744' }}>
                      {service.title}
                    </h2>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <p className="text-gray-600 leading-relaxed md:max-w-2xl">{service.description}</p>
                      <Link
                        href={`/quote?type=${service.id}`}
                        className="inline-flex shrink-0 self-end items-center justify-center rounded-lg px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700 md:self-start"
                        style={{ backgroundColor: '#16a34a' }}
                      >
                        Get instant quote
                      </Link>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                      {service.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-gray-700">
                          <span className="text-green-500 font-bold">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 text-white text-center" style={{ backgroundColor: '#22c55e' }}>
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">{getContentValue(content, 'services.bottom_cta_title', 'Not sure which service you need?')}</h2>
          <p className="text-green-50 mb-8">
            {getContentValue(content, 'services.bottom_cta_body', "Chat with Secure Bot, our AI assistant, or get in touch — we'll help you figure out the right solution.")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white text-lg transition-all"
              style={{ backgroundColor: '#1a2744' }}>
              {getContentValue(content, 'services.bottom_cta_primary_label', 'Get a Quote')}
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold text-lg border-2 border-white text-white hover:bg-white hover:text-green-600 transition-all">
              {getContentValue(content, 'services.bottom_cta_secondary_label', 'Contact Us')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
