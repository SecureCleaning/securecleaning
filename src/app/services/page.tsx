import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Commercial Cleaning Services',
  description:
    'Professional commercial cleaning for offices, medical centres, childcare, industrial, retail, gyms, and warehouses in Melbourne and Sydney.',
}

const services = [
  {
    id: 'office',
    icon: '🏢',
    title: 'Office Cleaning',
    description:
      'Regular or daily cleaning for offices, co-working spaces, corporate suites, and professional workplaces of all sizes. Includes desks, meeting rooms, kitchens, toilets, and common areas.',
    features: ['Open-plan workspace cleaning', 'Meeting room servicing', 'Kitchen and breakout areas', 'Bathroom and toilet cleaning', 'Bin emptying and waste management', 'Glass and mirror polishing'],
    multiplier: 'Standard rate',
  },
  {
    id: 'medical',
    icon: '🏥',
    title: 'Medical & Healthcare Cleaning',
    description:
      'Specialised clinical-grade cleaning for GP clinics, dental practices, allied health centres, physiotherapy studios, and other healthcare premises. Our operators understand infection control protocols.',
    features: ['Clinical surface disinfection', 'Cross-contamination prevention', 'Waiting room and reception cleaning', 'Treatment room preparation', 'Sharps bin area management', 'HACCP-aware practices'],
    multiplier: 'Medical rate applies',
  },
  {
    id: 'childcare',
    icon: '🎨',
    title: 'Childcare Centre Cleaning',
    description:
      'Safe, thorough cleaning for childcare centres, kindergartens, preschools, and OOSH services. We use child-safe products and understand the regulatory standards for early childhood environments.',
    features: ['Child-safe cleaning products only', 'Toy and surface sanitisation', 'Outdoor play area cleaning', 'Nappy change area disinfection', 'Compliance with ECA standards', 'After-hours cleaning available'],
    multiplier: 'Childcare rate applies',
  },
  {
    id: 'industrial',
    icon: '🏭',
    title: 'Industrial Cleaning',
    description:
      'Heavy-duty cleaning for factories, manufacturing facilities, production floors, and light industrial premises. Experienced operators with appropriate PPE and equipment.',
    features: ['Production floor cleaning', 'Machinery exterior cleaning', 'Oil and grease removal', 'Loading dock cleaning', 'Staff amenities maintenance', 'Waste area management'],
    multiplier: 'Industrial rate applies',
  },
  {
    id: 'retail',
    icon: '🛍️',
    title: 'Retail & Showroom Cleaning',
    description:
      'Presentation-focused cleaning for retail stores, showrooms, shopping strip tenancies, and boutique spaces. Create the right first impression for your customers every day.',
    features: ['Shop floor cleaning and mopping', 'Window and display cleaning', 'Counter and fitting room servicing', 'Entrance and foyer maintenance', 'Before-opening clean-ups', 'Stock room cleaning'],
    multiplier: 'Retail rate applies',
  },
  {
    id: 'gym',
    icon: '💪',
    title: 'Gym & Fitness Studio Cleaning',
    description:
      'Specialised cleaning for gyms, fitness studios, pilates studios, yoga centres, and leisure facilities. Our operators understand the importance of hygiene in high-contact exercise environments.',
    features: ['Equipment and machine wipe-down', 'Mat and floor sanitisation', 'Locker room and shower cleaning', 'Reception and foyer cleaning', 'Sweat and odour control', 'High-touch disinfection available'],
    multiplier: 'Fitness rate applies',
  },
  {
    id: 'warehouse',
    icon: '📦',
    title: 'Warehouse & Distribution Cleaning',
    description:
      'Practical, efficient cleaning for warehouses, distribution centres, logistics facilities, and storage premises. Keep your facility safe, compliant, and professional.',
    features: ['Warehouse floor sweeping and mopping', 'Office and amenities cleaning', 'Amenities block servicing', 'Rubbish consolidation', 'Dock area maintenance', 'Periodic pressure washing'],
    multiplier: 'Warehouse rate applies',
  },
  {
    id: 'other',
    icon: '🔧',
    title: 'Other Commercial Premises',
    description:
      "Have a unique or specialised commercial space? We work with a range of premises not covered by the categories above. Contact us to discuss your requirements.",
    features: ['Schools and education facilities', 'Places of worship', 'Event venues', 'Body corporate common areas', 'Government offices', 'And more…'],
    multiplier: 'Standard rate',
  },
]

export default function ServicesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="py-16 text-white text-center" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Services</h1>
          <p className="text-xl text-gray-300 mb-8">
            Specialised commercial cleaning for every type of premises.
            Melbourne and Sydney only. Owner-Operators who know your industry.
          </p>
          <Link href="/quote"
            className="inline-flex items-center px-8 py-4 rounded-lg font-bold text-white text-lg transition-all hover:opacity-90"
            style={{ backgroundColor: '#22c55e' }}>
            Get an Instant Quote
          </Link>
        </div>
      </section>

      {/* Services list */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10">
          {services.map((service) => (
            <div key={service.id} id={service.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8">
                <div className="flex items-start gap-5">
                  <div className="text-5xl shrink-0">{service.icon}</div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2" style={{ color: '#1a2744' }}>
                      {service.title}
                    </h2>
                    <p className="text-gray-600 leading-relaxed mb-5">{service.description}</p>
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
              <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">{service.multiplier}</span>
                <Link href={`/quote?type=${service.id}`}
                  className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
                  Quote for {service.title} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 text-white text-center" style={{ backgroundColor: '#22c55e' }}>
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">Not sure which service you need?</h2>
          <p className="text-green-50 mb-8">
            Chat with Max, our AI assistant, or get in touch — we&apos;ll help you figure out the right solution.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white text-lg transition-all"
              style={{ backgroundColor: '#1a2744' }}>
              Get a Quote
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold text-lg border-2 border-white text-white hover:bg-white hover:text-green-600 transition-all">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
