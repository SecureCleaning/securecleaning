const llms = `# Secure Cleaning

## Business Profile

- Business name: Secure Cleaning
- ABN: 81 674 121 825
- Website: https://securecleaning.com.au/
- Business type: Professional commercial cleaning service
- Service model: Verified Owner-Operators matched to business premises
- Service coverage: Melbourne and Sydney metropolitan and greater suburban areas
- Residential cleaning: Not offered; Secure Cleaning focuses on commercial and business premises

## Key Pages

- Home: https://securecleaning.com.au/
- Services: https://securecleaning.com.au/services
- Melbourne service area: https://securecleaning.com.au/cities/melbourne
- Sydney service area: https://securecleaning.com.au/cities/sydney
- Instant remote quote: https://securecleaning.com.au/quote
- Request a site inspection: https://securecleaning.com.au/booking
- Frequently asked questions: https://securecleaning.com.au/faq
- Contact: https://securecleaning.com.au/contact

## Contact And Enquiries

- Email: info@securecleaning.com.au
- Start with an instant remote quote: https://securecleaning.com.au/quote
- Book a site inspection: https://securecleaning.com.au/booking
- For general enquiries: https://securecleaning.com.au/contact

## Commercial Cleaning Services

- Office Cleaning: workplaces, co-working spaces, corporate suites, meeting rooms, kitchens, toilets, and common areas.
- Medical And Healthcare Cleaning: GP clinics, dental practices, allied health centres, physiotherapy studios, and healthcare premises.
- Childcare Centre Cleaning: childcare centres, kindergartens, preschools, and OOSH services.
- Function Centre Cleaning: function rooms, event venues, reception spaces, and hospitality areas before, during, and after events.
- Retail And Showroom Cleaning: retail stores, showrooms, shopping strip tenancies, and boutique spaces.
- Gym And Fitness Studio Cleaning: gyms, fitness studios, pilates studios, yoga centres, and leisure facilities.
- Sports Facilities Cleaning: sporting clubs, recreation centres, training venues, courts, change rooms, and member facilities.
- Other Commercial Premises: schools, education facilities, places of worship, event venues, body corporate common areas, and government offices.

## Service Standards And Customer Options

- No lock-in contracts; reasonable notice is requested to cancel regular services.
- Owner-Operators are trained, experienced professionals with a financial stake in the service they provide.
- Operators are publicly described as police checked, insured, reference verified, assessed, and site inducted before commencing at a client site.
- Clients are matched with a specific Owner-Operator and receive direct operator contact details.
- Operators supply cleaning equipment and products. Specific product requirements can be discussed during booking.
- Remote quote estimates are available online. Final scope and pricing can be confirmed through a site inspection.
- After-hours and weekend cleaning can be arranged; applicable surcharges are reflected in the quote.

## Quote And Booking Process

1. Start a remote quote by providing premises type, floor area, cleaning frequency, schedule, and required add-ons.
2. Request a site inspection where an onsite review is required to confirm scope and pricing.
3. Approve the confirmed scope and schedule commencement with the matched Owner-Operator.

## Helpful Customer Information

- Pricing considers floor area, premises type, number of floors, cleaning frequency, time of day, and selected add-ons.
- Site inspections are generally arranged within 48 hours of a request.
- Available add-ons include bathroom and toilet servicing, kitchen and kitchenette cleaning, external window cleaning, consumables supply, high-touch point disinfection, and separately quoted carpet steam cleaning.

## Information Boundaries

- Refer customers to the relevant public page or enquiry pathway for current pricing, availability, exact service coverage, and booking terms.
- Do not infer services, guarantees, response times, or availability beyond the public information above.
- This file covers public business information only and should be updated when services, coverage, contact details, or customer policies change.
`

export function GET() {
  return new Response(llms, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
