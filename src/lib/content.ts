import { supabase, getAdminSupabase } from '@/lib/supabase'

export type ContentEntryDefinition = {
  key: string
  title: string
  content: string
  group_name: string
}

export type ContentMap = Record<string, string>

const entry = (
  key: string,
  title: string,
  content: string,
  group_name: string
): ContentEntryDefinition => ({ key, title, content, group_name })

const homeEntries: ContentEntryDefinition[] = [
  entry('home.hero_badge', 'Homepage hero badge', "Melbourne & Sydney's Owner-Operator Cleaning Network", 'home'),
  entry('home.hero_title', 'Homepage hero title', 'Professional Commercial Cleaning for Melbourne & Sydney Businesses', 'home'),
  entry(
    'home.hero_subtitle',
    'Homepage hero subtitle',
    'Verified Owner-Operators. Transparent pricing. No lock-in contracts. Get an instant online quote and book your first clean today.',
    'home'
  ),
  entry('home.cta_primary_label', 'Homepage primary CTA label', 'Get an Instant Quote →', 'home'),
  entry('home.cta_secondary_label', 'Homepage secondary CTA label', 'View Services', 'home'),
  entry('home.trust_1', 'Homepage trust item 1', 'No lock-in contracts', 'home'),
  entry('home.trust_2', 'Homepage trust item 2', 'Fully insured & verified', 'home'),
  entry('home.trust_3', 'Homepage trust item 3', 'Instant online pricing', 'home'),
  entry('home.trust_4', 'Homepage trust item 4', 'Direct operator contact', 'home'),
  entry('home.how_title', 'Homepage how-it-works heading', 'How It Works', 'home'),
  entry('home.how_subtitle', 'Homepage how-it-works subtitle', 'From quote to clean in three simple steps. No phone tag, no waiting.', 'home'),
  entry('home.step_1_title', 'Homepage step 1 title', 'Get an Instant Quote', 'home'),
  entry('home.step_1_desc', 'Homepage step 1 description', 'Answer a few questions about your premises and schedule. Our pricing engine gives you a transparent estimate in under 2 minutes — no waiting for a callback.', 'home'),
  entry('home.step_2_title', 'Homepage step 2 title', 'We Match Your Operator', 'home'),
  entry('home.step_2_desc', 'Homepage step 2 description', 'We pair you with a verified, insured Owner-Operator in your area who specialises in your type of premises. Site inspection arranged within 48 hours.', 'home'),
  entry('home.step_3_title', 'Homepage step 3 title', 'Your Space, Professionally Cleaned', 'home'),
  entry('home.step_3_desc', 'Homepage step 3 description', "Your operator starts on your schedule. You have their direct number. If anything ever isn't right, you tell them — and it gets fixed.", 'home'),
  entry('home.how_cta_label', 'Homepage how-it-works CTA label', 'Start Your Quote', 'home'),
  entry('home.why_title', 'Homepage why section heading', 'Why Secure Cleaning Aus?', 'home'),
  entry('home.why_subtitle', 'Homepage why section subtitle', "The Owner-Operator model is fundamentally different — and better. Here's why businesses across Melbourne and Sydney choose us.", 'home'),
  entry('home.benefit_1_title', 'Homepage benefit 1 title', 'No Lock-In Contracts', 'home'),
  entry('home.benefit_1_desc', 'Homepage benefit 1 description', "Stay because you love the service — not because you're trapped. Cancel any time with reasonable notice.", 'home'),
  entry('home.benefit_2_title', 'Homepage benefit 2 title', 'Real Professionals', 'home'),
  entry('home.benefit_2_desc', 'Homepage benefit 2 description', 'Every cleaner is a trained, experienced professional — not a day-hire casual.', 'home'),
  entry('home.benefit_3_title', 'Homepage benefit 3 title', 'Financially Committed', 'home'),
  entry('home.benefit_3_desc', 'Homepage benefit 3 description', 'Owner-Operators have purchased their territory. They have skin in the game and a business to protect.', 'home'),
  entry('home.benefit_4_title', 'Homepage benefit 4 title', 'Fully Verified', 'home'),
  entry('home.benefit_4_desc', 'Homepage benefit 4 description', "Police checked, insured, and reference verified. We don't send strangers to your premises.", 'home'),
  entry('home.benefit_5_title', 'Homepage benefit 5 title', 'Site Inducted', 'home'),
  entry('home.benefit_5_desc', 'Homepage benefit 5 description', "Your operator learns your site's specific requirements, hazards, and preferences before they start.", 'home'),
  entry('home.benefit_6_title', 'Homepage benefit 6 title', 'Direct Contact', 'home'),
  entry('home.benefit_6_desc', 'Homepage benefit 6 description', "You get your operator's direct number. No call centres, no middlemen, no runaround.", 'home'),
  entry('home.premises_title', 'Homepage premises section heading', 'Premises We Clean', 'home'),
  entry('home.premises_subtitle', 'Homepage premises section subtitle', 'From boutique offices to large industrial facilities — we have Owner-Operators specialised in every type of commercial premises.', 'home'),
  entry('home.cities_title', 'Homepage cities section heading', 'Where We Operate', 'home'),
  entry('home.cities_subtitle', 'Homepage cities section subtitle', 'Melbourne and Sydney — with more cities coming soon.', 'home'),
  entry('home.city_melbourne_desc', 'Homepage Melbourne card description', 'CBD, inner suburbs, and greater metro area. Owner-Operators across all Melbourne zones.', 'home'),
  entry('home.city_melbourne_label', 'Homepage Melbourne card label', 'View Melbourne →', 'home'),
  entry('home.city_sydney_desc', 'Homepage Sydney card description', 'CBD, North Shore, Western Sydney, and surrounding areas. Fully covered.', 'home'),
  entry('home.city_sydney_label', 'Homepage Sydney card label', 'View Sydney →', 'home'),
  entry('home.testimonials_title', 'Homepage testimonials heading', 'What Our Clients Say', 'home'),
  entry('home.testimonials_subtitle', 'Homepage testimonials subtitle', "Don't take our word for it.", 'home'),
  entry('home.testimonial_1_name', 'Homepage testimonial 1 name', 'Sarah M.', 'home'),
  entry('home.testimonial_1_business', 'Homepage testimonial 1 business', 'Parkville Medical Centre', 'home'),
  entry('home.testimonial_1_city', 'Homepage testimonial 1 city', 'Melbourne', 'home'),
  entry('home.testimonial_1_quote', 'Homepage testimonial 1 quote', "Switched from a national franchise 18 months ago. The difference is night and day — our operator treats our clinic like it's their own business. Because it is.", 'home'),
  entry('home.testimonial_2_name', 'Homepage testimonial 2 name', 'James T.', 'home'),
  entry('home.testimonial_2_business', 'Homepage testimonial 2 business', 'East Sydney Co-Working', 'home'),
  entry('home.testimonial_2_city', 'Homepage testimonial 2 city', 'Sydney', 'home'),
  entry('home.testimonial_2_quote', 'Homepage testimonial 2 quote', 'Loved that I could get an instant quote online and book without playing phone tag. Our space has been spotless since day one.', 'home'),
  entry('home.testimonial_3_name', 'Homepage testimonial 3 name', 'Priya K.', 'home'),
  entry('home.testimonial_3_business', 'Homepage testimonial 3 business', 'Little Stars Childcare', 'home'),
  entry('home.testimonial_3_city', 'Homepage testimonial 3 city', 'Melbourne', 'home'),
  entry('home.testimonial_3_quote', 'Homepage testimonial 3 quote', "As a childcare centre, we need someone we can trust completely. Our operator came in for a site induction before starting and hasn't missed a clean in 8 months.", 'home'),
  entry('home.bottom_cta_title', 'Homepage bottom CTA heading', 'Ready for a cleaner, better workplace?', 'home'),
  entry('home.bottom_cta_body', 'Homepage bottom CTA body', 'Get your instant quote in under 2 minutes. No commitment required.', 'home'),
  entry('home.bottom_cta_primary_label', 'Homepage bottom CTA primary button label', 'Get an Instant Quote', 'home'),
  entry('home.bottom_cta_secondary_label', 'Homepage bottom CTA secondary button label', 'Contact Us', 'home'),
]

const aboutEntries: ContentEntryDefinition[] = [
  entry('about.hero_title', 'About page hero title', 'About Secure Cleaning Aus', 'about'),
  entry('about.hero_subtitle', 'About page hero subtitle', 'A better way to clean your business. Built on the Owner-Operator model.', 'about'),
  entry('about.section_1_title', 'About section 1 heading', 'Who We Are', 'about'),
  entry('about.intro', 'About page intro paragraph', 'Secure Cleaning Aus is a trading name of Secure Contracts Pty Ltd, an Australian company focused on delivering professional commercial cleaning services to businesses in Melbourne and Sydney through our Owner-Operator network.', 'about'),
  entry('about.section_1_paragraph_2', 'About section 1 paragraph 2', 'We started with a simple observation: the commercial cleaning industry was dominated by large franchise operators who hired casual, low-paid workers with minimal investment in quality or consistency. Clients were locked into long contracts, left dealing with call centres, and had no direct relationship with the person cleaning their premises.', 'about'),
  entry('about.section_1_paragraph_3', 'About section 1 paragraph 3', 'We believed there was a better way.', 'about'),
  entry('about.section_2_title', 'About section 2 heading', 'The Owner-Operator Model', 'about'),
  entry('about.section_2_intro', 'About section 2 intro paragraph', 'Every Secure Cleaning Aus operator is an independent business owner who has purchased a territory and invested in their own business. This creates fundamentally different incentives:', 'about'),
  entry('about.model_point_1', 'About model point 1', "Financial commitment: Our operators have real money at stake. They've purchased their territory and have a business to protect.", 'about'),
  entry('about.model_point_2', 'About model point 2', 'Personal accountability: When you call about a concern, you call your operator directly — not a 1300 number.', 'about'),
  entry('about.model_point_3', 'About model point 3', 'Long-term thinking: Owner-Operators build client relationships over years, not weeks.', 'about'),
  entry('about.model_point_4', 'About model point 4', "Professional pride: These aren't casuals. They're trained cleaning professionals who run their own business.", 'about'),
  entry('about.section_3_title', 'About section 3 heading', 'Verification & Standards', 'about'),
  entry('about.section_3_intro', 'About section 3 intro paragraph', 'Every Secure Cleaning Aus operator must pass our verification process before taking on clients:', 'about'),
  entry('about.standard_1', 'About standard 1', 'National police check', 'about'),
  entry('about.standard_2', 'About standard 2', 'Public liability insurance verification', 'about'),
  entry('about.standard_3', 'About standard 3', 'Reference checks', 'about'),
  entry('about.standard_4', 'About standard 4', 'Skills assessment', 'about'),
  entry('about.standard_5', 'About standard 5', 'Site induction process for each new client', 'about'),
  entry('about.standard_6', 'About standard 6', 'Ongoing performance monitoring through client feedback', 'about'),
  entry('about.section_4_title', 'About section 4 heading', 'Our Coverage', 'about'),
  entry('about.section_4_body', 'About section 4 body', 'We currently operate in Melbourne and Sydney, with plans to expand to other major Australian cities. Our operators cover metro and surrounding areas in both cities.', 'about'),
  entry('about.section_5_title', 'About section 5 heading', 'No Lock-In Contracts', 'about'),
  entry('about.section_5_body', 'About section 5 body', "We don't believe in trapping clients. If the service isn't working for you, you can cancel with reasonable notice. We believe the only valid reason to stay is that the service is genuinely excellent — and that's what we're here to deliver.", 'about'),
  entry('about.bottom_cta_title', 'About page bottom CTA heading', 'Ready to experience the difference?', 'about'),
  entry('about.bottom_cta_primary_label', 'About page bottom CTA primary button label', 'Get an Instant Quote', 'about'),
  entry('about.bottom_cta_secondary_label', 'About page bottom CTA secondary button label', 'Contact Us', 'about'),
]

const contactEntries: ContentEntryDefinition[] = [
  entry('contact.hero_title', 'Contact page heading', 'Contact Us', 'contact'),
  entry('contact.hero_subtitle', 'Contact page subtitle', "Prefer to talk? We're here to help. Or skip the wait and get an instant quote online.", 'contact'),
  entry('contact.card_title', 'Contact details card heading', 'Get in Touch', 'contact'),
  entry('contact.email_label', 'Contact email label', 'Email', 'contact'),
  entry('contact.email', 'Contact email address', 'info@securecleaning.au', 'contact'),
  entry('contact.email_note', 'Contact email note', 'We aim to respond within 1 business day', 'contact'),
  entry('contact.phone_label', 'Contact phone label', 'Phone', 'contact'),
  entry('contact.phone', 'Contact phone number', '1300 000 000', 'contact'),
  entry('contact.phone_note', 'Contact phone note', 'For urgent enquiries during business hours', 'contact'),
  entry('contact.service_areas_label', 'Contact service areas label', 'Service Areas', 'contact'),
  entry('contact.service_areas', 'Contact service areas', 'Melbourne & Sydney, Australia', 'contact'),
  entry('contact.hours_label', 'Contact business hours label', 'Business Hours', 'contact'),
  entry('contact.hours', 'Contact business hours', 'Monday – Friday, 8am – 6pm AEST', 'contact'),
  entry('contact.hours_note', 'Contact business hours note', 'AI chat available 24/7', 'contact'),
  entry('contact.quick_links_title', 'Contact quick links heading', 'Quick Links', 'contact'),
  entry('contact.quick_link_1', 'Contact quick link 1', '⚡ Get an instant quote online', 'contact'),
  entry('contact.quick_link_2', 'Contact quick link 2', '📅 Book a cleaning service', 'contact'),
  entry('contact.quick_link_3', 'Contact quick link 3', '❓ View frequently asked questions', 'contact'),
  entry('contact.quick_link_4', 'Contact quick link 4', '🧹 Browse our services', 'contact'),
  entry('contact.form_title', 'Contact form heading', 'Send a Message', 'contact'),
  entry('contact.form_note', 'Contact form note', 'Note: This form is a placeholder. For fastest response, email us directly or use the live quote tool.', 'contact'),
  entry('contact.form_button_label', 'Contact form button label', 'Send Message (Coming Soon)', 'contact'),
  entry('contact.bottom_banner_title', 'Contact bottom banner title', 'Need an answer right now? 🤖', 'contact'),
  entry('contact.bottom_banner_body', 'Contact bottom banner body', 'Chat with Max, our AI assistant, for instant answers about services, pricing, and more — available 24/7.', 'contact'),
]

const faqEntries: ContentEntryDefinition[] = [
  entry('faq.heading', 'FAQ page heading', 'Frequently Asked Questions', 'faq'),
  entry('faq.intro', 'FAQ page intro text', "Can't find your answer here? Chat with Max or", 'faq'),
  entry('faq.item_1_question', 'FAQ 1 question', 'What is an Owner-Operator?', 'faq'),
  entry('faq.item_1_answer', 'FAQ 1 answer', 'An Owner-Operator is an independent business owner who has purchased a cleaning territory from Secure Contracts. Unlike casual workers employed by a franchise, Owner-Operators have invested their own money and have a genuine financial stake in the quality of their work. They run their cleaning business as their own enterprise.', 'faq'),
  entry('faq.item_2_question', 'FAQ 2 question', 'Which cities do you service?', 'faq'),
  entry('faq.item_2_answer', 'FAQ 2 answer', 'We currently operate in Melbourne and Sydney only. We cover metro and greater suburban areas in both cities. More cities will be added in the future.', 'faq'),
  entry('faq.item_3_question', 'FAQ 3 question', 'How is pricing calculated?', 'faq'),
  entry('faq.item_3_answer', 'FAQ 3 answer', 'Our pricing is based on your floor area, premises type, number of floors, cleaning frequency, time of day, and any add-ons you require. Use our instant online quote calculator to get a transparent price estimate in under 2 minutes — no waiting for a callback.', 'faq'),
  entry('faq.item_4_question', 'FAQ 4 question', 'Is there a minimum contract period?', 'faq'),
  entry('faq.item_4_answer', 'FAQ 4 answer', "No. We don't believe in lock-in contracts. You stay because the service is excellent, not because you're trapped. We do ask for reasonable notice to cancel — typically 2 weeks for regular services.", 'faq'),
  entry('faq.item_5_question', 'FAQ 5 question', 'What does the verification process involve?', 'faq'),
  entry('faq.item_5_answer', 'FAQ 5 answer', 'Every Secure Cleaning Aus operator must complete a national police check, provide evidence of public liability insurance, pass reference checks, undergo a skills assessment, and complete a site induction process for each new client. We do not send unverified people to your premises.', 'faq'),
  entry('faq.item_6_question', 'FAQ 6 question', 'How quickly can a clean be arranged?', 'faq'),
  entry('faq.item_6_answer', 'FAQ 6 answer', 'For new clients, we aim to arrange a site inspection within 48 hours of your booking. From there, your first clean can typically be scheduled within 1–2 weeks, depending on your preferred start date and operator availability.', 'faq'),
  entry('faq.item_7_question', 'FAQ 7 question', 'Will I always have the same cleaner?', 'faq'),
  entry('faq.item_7_answer', 'FAQ 7 answer', "Yes. You're matched with a specific Owner-Operator who is responsible for your premises. You get their direct contact details. This continuity is one of the core advantages of the Owner-Operator model.", 'faq'),
  entry('faq.item_8_question', 'FAQ 8 question', "What if I'm not happy with the service?", 'faq'),
  entry('faq.item_8_answer', 'FAQ 8 answer', "Contact your operator directly — they have a strong incentive to address any concerns immediately because their business reputation depends on it. If issues persist, contact us and we'll intervene. In rare cases where an operator match isn't working, we'll rematch you.", 'faq'),
  entry('faq.item_9_question', 'FAQ 9 question', 'Do you bring your own cleaning products and equipment?', 'faq'),
  entry('faq.item_9_answer', 'FAQ 9 answer', "Yes. Owner-Operators supply all equipment and cleaning products. If you require specific products (e.g. environmentally certified, fragrance-free), let us know in your booking notes and we'll match you with an operator who can accommodate this.", 'faq'),
  entry('faq.item_10_question', 'FAQ 10 question', 'What add-on services are available?', 'faq'),
  entry('faq.item_10_answer', 'FAQ 10 answer', 'Available add-ons include: bathroom/toilet servicing, kitchen and kitchenette cleaning, external window cleaning, consumables supply (toilet paper, soap, paper towels), and high-touch point disinfection. Carpet steam cleaning is quoted separately.', 'faq'),
  entry('faq.item_11_question', 'FAQ 11 question', 'Can I get a spring clean or one-off deep clean?', 'faq'),
  entry('faq.item_11_answer', 'FAQ 11 answer', 'Yes. Select "Once-Off" as your frequency, and check the Spring Clean option in our quote form. Spring cleans are priced higher than regular cleans (typically 2–3x the regular rate) to reflect the additional time and effort required.', 'faq'),
  entry('faq.item_12_question', 'FAQ 12 question', 'Are your cleaners insured?', 'faq'),
  entry('faq.item_12_answer', 'FAQ 12 answer', 'All Secure Cleaning Aus Owner-Operators are required to hold public liability insurance as a condition of operating. We verify this before any operator is permitted to take on clients.', 'faq'),
  entry('faq.item_13_question', 'FAQ 13 question', 'Do you clean residential properties?', 'faq'),
  entry('faq.item_13_answer', 'FAQ 13 answer', 'No. Secure Cleaning Aus focuses exclusively on commercial and business premises. We do not offer residential cleaning services.', 'faq'),
  entry('faq.item_14_question', 'FAQ 14 question', 'Can you clean at night or on weekends?', 'faq'),
  entry('faq.item_14_answer', 'FAQ 14 answer', 'Yes. We offer after-hours (post 6pm weekdays) and weekend cleaning. Note that after-hours and weekend cleaning attracts a surcharge (25% and 50% respectively), which is reflected in your quote.', 'faq'),
  entry('faq.cta_heading', 'FAQ bottom CTA heading', 'Still have questions?', 'faq'),
  entry('faq.cta_body', 'FAQ bottom CTA body text', 'Get an instant estimate with our quote calculator, chat with Max 24/7, or reach out directly.', 'faq'),
  entry('faq.cta_primary_label', 'FAQ bottom CTA primary button label', 'Get a Quote', 'faq'),
  entry('faq.cta_secondary_label', 'FAQ bottom CTA secondary button label', 'Contact Us', 'faq'),
]

const servicesEntries: ContentEntryDefinition[] = [
  entry('services.hero_title', 'Services page hero title', 'Our Services', 'services'),
  entry('services.hero_subtitle', 'Services page hero subtitle', 'Specialised commercial cleaning for every type of premises. Melbourne and Sydney only. Owner-Operators who know your industry.', 'services'),
  entry('services.hero_cta_label', 'Services page hero CTA label', 'Get an Instant Quote', 'services'),
  entry('services.item_1_title', 'Service 1 title', 'Office Cleaning', 'services'),
  entry('services.item_1_description', 'Service 1 description', 'Regular or daily cleaning for offices, co-working spaces, corporate suites, and professional workplaces of all sizes. Includes desks, meeting rooms, kitchens, toilets, and common areas.', 'services'),
  entry('services.item_1_multiplier', 'Service 1 pricing label', 'Standard rate', 'services'),
  entry('services.item_2_title', 'Service 2 title', 'Medical & Healthcare Cleaning', 'services'),
  entry('services.item_2_description', 'Service 2 description', 'Specialised clinical-grade cleaning for GP clinics, dental practices, allied health centres, physiotherapy studios, and other healthcare premises. Our operators understand infection control protocols.', 'services'),
  entry('services.item_2_multiplier', 'Service 2 pricing label', 'Medical rate applies', 'services'),
  entry('services.item_3_title', 'Service 3 title', 'Childcare Centre Cleaning', 'services'),
  entry('services.item_3_description', 'Service 3 description', 'Safe, thorough cleaning for childcare centres, kindergartens, preschools, and OOSH services. We use child-safe products and understand the regulatory standards for early childhood environments.', 'services'),
  entry('services.item_3_multiplier', 'Service 3 pricing label', 'Childcare rate applies', 'services'),
  entry('services.item_4_title', 'Service 4 title', 'Industrial Cleaning', 'services'),
  entry('services.item_4_description', 'Service 4 description', 'Heavy-duty cleaning for factories, manufacturing facilities, production floors, and light industrial premises. Experienced operators with appropriate PPE and equipment.', 'services'),
  entry('services.item_4_multiplier', 'Service 4 pricing label', 'Industrial rate applies', 'services'),
  entry('services.item_5_title', 'Service 5 title', 'Retail & Showroom Cleaning', 'services'),
  entry('services.item_5_description', 'Service 5 description', 'Presentation-focused cleaning for retail stores, showrooms, shopping strip tenancies, and boutique spaces. Create the right first impression for your customers every day.', 'services'),
  entry('services.item_5_multiplier', 'Service 5 pricing label', 'Retail rate applies', 'services'),
  entry('services.item_6_title', 'Service 6 title', 'Gym & Fitness Studio Cleaning', 'services'),
  entry('services.item_6_description', 'Service 6 description', 'Specialised cleaning for gyms, fitness studios, pilates studios, yoga centres, and leisure facilities. Our operators understand the importance of hygiene in high-contact exercise environments.', 'services'),
  entry('services.item_6_multiplier', 'Service 6 pricing label', 'Fitness rate applies', 'services'),
  entry('services.item_7_title', 'Service 7 title', 'Warehouse & Distribution Cleaning', 'services'),
  entry('services.item_7_description', 'Service 7 description', 'Practical, efficient cleaning for warehouses, distribution centres, logistics facilities, and storage premises. Keep your facility safe, compliant, and professional.', 'services'),
  entry('services.item_7_multiplier', 'Service 7 pricing label', 'Warehouse rate applies', 'services'),
  entry('services.item_8_title', 'Service 8 title', 'Other Commercial Premises', 'services'),
  entry('services.item_8_description', 'Service 8 description', 'Have a unique or specialised commercial space? We work with a range of premises not covered by the categories above. Contact us to discuss your requirements.', 'services'),
  entry('services.item_8_multiplier', 'Service 8 pricing label', 'Standard rate', 'services'),
  entry('services.bottom_cta_title', 'Services page bottom CTA heading', 'Not sure which service you need?', 'services'),
  entry('services.bottom_cta_body', 'Services page bottom CTA body', "Chat with Max, our AI assistant, or get in touch — we'll help you figure out the right solution.", 'services'),
  entry('services.bottom_cta_primary_label', 'Services page bottom CTA primary button label', 'Get a Quote', 'services'),
  entry('services.bottom_cta_secondary_label', 'Services page bottom CTA secondary button label', 'Contact Us', 'services'),
]

const citiesEntries: ContentEntryDefinition[] = [
  entry('cities.hero_title', 'Cities page heading', 'Cities We Service', 'cities'),
  entry('cities.hero_subtitle', 'Cities page subtitle', 'Currently operating in Melbourne and Sydney, with more cities coming soon.', 'cities'),
  entry('cities.melbourne_desc', 'Cities page Melbourne description', 'CBD, inner suburbs, and greater metro area. Owner-Operators across all Melbourne zones including St Kilda, Richmond, Fitzroy, Docklands, Southbank, and the eastern/western/northern/southeastern suburbs.', 'cities'),
  entry('cities.melbourne_label', 'Cities page Melbourne link label', 'View Melbourne →', 'cities'),
  entry('cities.sydney_desc', 'Cities page Sydney description', 'CBD, North Shore, Eastern Suburbs, Western Sydney, Parramatta, and surrounding areas. Fully covered by our network of verified Owner-Operators.', 'cities'),
  entry('cities.sydney_label', 'Cities page Sydney link label', 'View Sydney →', 'cities'),
]

const melbourneEntries: ContentEntryDefinition[] = [
  entry('melbourne.hero_title', 'Melbourne page hero title', 'Commercial Cleaning Melbourne', 'melbourne'),
  entry('melbourne.hero_body', 'Melbourne page hero body', 'Secure Cleaning Aus operates across all of Melbourne — from the CBD and inner suburbs to the outer metro area. Our verified Owner-Operators are local business owners who know Melbourne inside out.', 'melbourne'),
  entry('melbourne.why_title', 'Melbourne page why section heading', 'Why Melbourne Businesses Choose Secure Cleaning Aus', 'melbourne'),
  entry('melbourne.why_body_1', 'Melbourne page why section paragraph 1', "Melbourne's commercial property market is dense and competitive. Whether you're in a Collins Street tower, a Fitzroy warehouse conversion, or an industrial estate in the west, your cleaning needs to be reliable, consistent, and professionally managed.", 'melbourne'),
  entry('melbourne.why_body_2', 'Melbourne page why section paragraph 2', "Our Melbourne Owner-Operators have invested in their territories. They're not casuals who might not show up — they're business owners with a reputation to protect and a livelihood that depends on your satisfaction.", 'melbourne'),
  entry('melbourne.areas_title', 'Melbourne page areas heading', 'Areas We Cover', 'melbourne'),
  entry('melbourne.areas_note', 'Melbourne page areas note', "Don't see your suburb? We likely cover it — get a quote and we'll confirm.", 'melbourne'),
  entry('melbourne.pricing_title', 'Melbourne pricing box heading', 'Melbourne Pricing', 'melbourne'),
  entry('melbourne.pricing_body', 'Melbourne pricing box body', 'Melbourne pricing includes a city rate adjustment reflecting local labour costs. Use our instant quote calculator for accurate estimates.', 'melbourne'),
  entry('melbourne.pricing_cta_label', 'Melbourne pricing CTA label', 'Get Melbourne Quote', 'melbourne'),
  entry('melbourne.services_title', 'Melbourne services box heading', 'Services Available', 'melbourne'),
  entry('melbourne.chat_title', 'Melbourne chat box title', '🤖 Chat with Max', 'melbourne'),
  entry('melbourne.chat_body', 'Melbourne chat box body', 'Questions about Melbourne services? Max can help 24/7.', 'melbourne'),
  entry('melbourne.bottom_cta_title', 'Melbourne bottom CTA heading', 'Ready to get started in Melbourne?', 'melbourne'),
  entry('melbourne.bottom_cta_primary_label', 'Melbourne bottom CTA primary button label', 'Get Melbourne Quote', 'melbourne'),
  entry('melbourne.bottom_cta_secondary_label', 'Melbourne bottom CTA secondary button label', 'Book a Clean', 'melbourne'),
]

const sydneyEntries: ContentEntryDefinition[] = [
  entry('sydney.hero_title', 'Sydney page hero title', 'Commercial Cleaning Sydney', 'sydney'),
  entry('sydney.hero_body', 'Sydney page hero body', 'Secure Cleaning Aus operates across greater Sydney — CBD, North Shore, Eastern Suburbs, Western Sydney, and the broader metro area. Verified Owner-Operators who take pride in your premises.', 'sydney'),
  entry('sydney.why_title', 'Sydney page why section heading', 'Why Sydney Businesses Choose Secure Cleaning Aus', 'sydney'),
  entry('sydney.why_body_1', 'Sydney page why section paragraph 1', "Sydney's commercial sector spans everything from glass-tower CBD offices to industrial parks in Blacktown, from medical precincts in Macquarie Park to childcare centres across the suburbs. Each environment has different needs — and our Owner-Operators are matched to your specific type of premises.", 'sydney'),
  entry('sydney.why_body_2', 'Sydney page why section paragraph 2', "With Sydney's high cost of doing business, reliability is everything. Our Owner-Operators have invested in their territories — they have every incentive to show up, do a great job, and keep your business.", 'sydney'),
  entry('sydney.areas_title', 'Sydney page areas heading', 'Areas We Cover', 'sydney'),
  entry('sydney.areas_note', 'Sydney page areas note', "Don't see your suburb? We likely cover it — get a quote to confirm.", 'sydney'),
  entry('sydney.pricing_title', 'Sydney pricing box heading', 'Sydney Pricing', 'sydney'),
  entry('sydney.pricing_body', 'Sydney pricing box body', 'Sydney pricing reflects local labour market conditions. Use our instant quote calculator for an accurate, transparent estimate.', 'sydney'),
  entry('sydney.pricing_cta_label', 'Sydney pricing CTA label', 'Get Sydney Quote', 'sydney'),
  entry('sydney.services_title', 'Sydney services box heading', 'Services Available', 'sydney'),
  entry('sydney.chat_title', 'Sydney chat box title', '🤖 Chat with Max', 'sydney'),
  entry('sydney.chat_body', 'Sydney chat box body', 'Questions about Sydney services? Max can help 24/7.', 'sydney'),
  entry('sydney.bottom_cta_title', 'Sydney bottom CTA heading', 'Ready to get started in Sydney?', 'sydney'),
  entry('sydney.bottom_cta_primary_label', 'Sydney bottom CTA primary button label', 'Get Sydney Quote', 'sydney'),
  entry('sydney.bottom_cta_secondary_label', 'Sydney bottom CTA secondary button label', 'Book a Clean', 'sydney'),
]

const quoteEntries: ContentEntryDefinition[] = [
  entry('quote.hero_title', 'Quote page heading', 'Get an Instant Quote', 'quote'),
  entry('quote.hero_subtitle', 'Quote page subtitle', 'Takes under 2 minutes. Get an instant estimate sent to your email — no waiting for a callback.', 'quote'),
  entry('quote.result_not_found_title', 'Quote result not-found title', 'Quote not found', 'quote'),
  entry('quote.result_not_found_body', 'Quote result not-found body', 'This quote may have expired or was accessed from a different browser. Check your email for your quote, or generate a new one.', 'quote'),
  entry('quote.result_not_found_cta_label', 'Quote result not-found CTA label', 'Get a New Quote', 'quote'),
]

const bookingEntries: ContentEntryDefinition[] = [
  entry('booking.hero_title', 'Booking page heading', 'Book Your Clean', 'booking'),
  entry('booking.hero_subtitle', 'Booking page subtitle', "Complete your booking request and we'll match you with a verified Owner-Operator in your area within 1 business day.", 'booking'),
  entry('booking.confirm_not_found_title', 'Booking confirm not-found title', 'Booking not found', 'booking'),
  entry('booking.confirm_not_found_body', 'Booking confirm not-found body', 'Check your confirmation email or contact us.', 'booking'),
  entry('booking.confirm_not_found_cta_label', 'Booking confirm not-found CTA label', 'Back to Home', 'booking'),
  entry('booking.confirm_title', 'Booking confirmation title', 'Booking Submitted!', 'booking'),
  entry('booking.confirm_reference_prefix', 'Booking confirmation reference prefix', 'Reference:', 'booking'),
  entry('booking.confirm_email_prefix', 'Booking confirmation email prefix', 'Confirmation sent to', 'booking'),
  entry('booking.summary_title', 'Booking summary heading', 'Booking Summary', 'booking'),
  entry('booking.next_title', 'Booking next-steps heading', 'What Happens Next?', 'booking'),
  entry('booking.next_step_1', 'Booking next step 1', 'Our team reviews your booking (usually within 1 business day)', 'booking'),
  entry('booking.next_step_2_template', 'Booking next step 2 template', 'We match you with a verified Owner-Operator in {city}', 'booking'),
  entry('booking.next_step_3', 'Booking next step 3', 'A site inspection is arranged — typically within 48 hours', 'booking'),
  entry('booking.next_step_4', 'Booking next step 4', "You receive your operator's direct contact details", 'booking'),
  entry('booking.next_step_5', 'Booking next step 5', 'Your first clean is scheduled to your preferred date', 'booking'),
  entry('booking.bottom_primary_label', 'Booking confirmation bottom primary button label', 'Back to Home', 'booking'),
  entry('booking.bottom_secondary_label', 'Booking confirmation bottom secondary button label', 'Contact Us', 'booking'),
]

export const CONTENT_DEFAULTS: ContentEntryDefinition[] = [
  ...homeEntries,
  ...aboutEntries,
  ...contactEntries,
  ...faqEntries,
  ...servicesEntries,
  ...citiesEntries,
  ...melbourneEntries,
  ...sydneyEntries,
  ...quoteEntries,
  ...bookingEntries,
]

export type SiteContentRow = ContentEntryDefinition & {
  updated_at?: string | null
}

const DEFAULT_CONTENT_MAP = CONTENT_DEFAULTS.reduce<ContentMap>((acc, entry) => {
  acc[entry.key] = entry.content
  return acc
}, {})

export function getContentValue(map: ContentMap | null | undefined, key: string, fallback: string) {
  return map?.[key] || fallback
}

export async function getPublicContentMap(): Promise<ContentMap> {
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('key, content')

    if (error || !data) {
      if (error) {
        console.error('[content] Failed to load public content:', error)
      }
      return { ...DEFAULT_CONTENT_MAP }
    }

    return data.reduce<ContentMap>((acc, row) => {
      acc[row.key] = row.content
      return acc
    }, { ...DEFAULT_CONTENT_MAP })
  } catch (error) {
    console.error('[content] Unexpected error loading public content:', error)
    return { ...DEFAULT_CONTENT_MAP }
  }
}

export async function getAllContentEntries(): Promise<SiteContentRow[]> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('site_content')
      .select('key, title, content, group_name, updated_at')
      .order('group_name', { ascending: true })
      .order('title', { ascending: true })

    if (error || !data) {
      if (error) {
        console.error('[content] Failed to load admin content:', error)
      }
      return CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))
    }

    const rowsByKey = new Map(data.map((row) => [row.key, row]))

    return CONTENT_DEFAULTS.map((entry) => rowsByKey.get(entry.key) ?? { ...entry, updated_at: null })
  } catch (error) {
    console.error('[content] Unexpected error loading admin content:', error)
    return CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))
  }
}

export async function upsertContentEntries(entries: ContentEntryDefinition[]) {
  const db = getAdminSupabase()

  const payload = entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    content: entry.content,
    group_name: entry.group_name,
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await db
    .from('site_content')
    .upsert(payload, { onConflict: 'key' })
    .select('key, title, content, group_name, updated_at')

  if (error) {
    throw error
  }

  return data ?? []
}
