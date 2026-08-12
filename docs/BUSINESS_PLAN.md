# Secure Contracts Pty Ltd — Commercial Cleaning Portal
## Business Plan
**Version 1.1 | March 2026**
*Authored by Franky ⚡ in collaboration with Lyle*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Market Analysis](#2-market-analysis)
3. [Business Model & Revenue Streams](#3-business-model--revenue-streams)
4. [Product: The Online Portal](#4-product-the-online-portal)
5. [Quoting Engine — Logic & Pricing Model](#5-quoting-engine--logic--pricing-model)
6. [Booking System & Calendar Management](#6-booking-system--calendar-management)
7. [Database Architecture](#7-database-architecture)
8. [AI Customer Support Agent](#8-ai-customer-support-agent)
9. [Back-End Website Structure](#9-back-end-website-structure)
10. [Email & Communication System](#10-email--communication-system)
11. [Marketing Strategy](#11-marketing-strategy)
12. [Deployment Plan](#12-deployment-plan)
13. [Hardware Requirements](#13-hardware-requirements)
14. [Financial Projections](#14-financial-projections)
15. [Phased Build Plan](#15-phased-build-plan)
16. [Risk Register](#16-risk-register)

---

## 1. Executive Summary

**Legal Entity:** Secure Contracts Pty Ltd
**Client-Facing Brand:** Secure Cleaning Aus
**Business Model:** Broker — we place experienced, vetted independent cleaning contractors into client sites
**Launch Cities:** Melbourne and Sydney

**What it is:** A professional online portal targeted at businesses in Melbourne and Sydney that need commercial cleaning services. The portal enables potential clients to self-serve an instant indicative quote, book an in-person inspection appointment, and interact with a 24/7 AI assistant — all without requiring staff time on our end until a lead is qualified. Secure Contracts operates as the intermediary: sourcing and vetting contractors, placing them with clients, and maintaining quality through a performance-based incentive structure.

**Why this works:**
- The Australian commercial cleaning industry is worth **$20+ billion** in 2026, growing at ~6% CAGR
- The market is highly fragmented — 44,000+ businesses, but no dominant player in the digital/online quoting space
- SME clients (offices, retail, healthcare, education) actively search online for quotes and are underserved by phone-only providers
- A slick online experience immediately signals professionalism and separates us from competitors
- Broker model = lower capital requirements than employing cleaners directly; scale faster

**Target cities (launch):** Melbourne and Sydney *(expand to Brisbane, Adelaide, Perth, Canberra in Phase 2)*

**Core competitive advantage:** Speed + transparency. Most competitors make clients wait days for a quote. We give an indicative one in 60 seconds.

---

## 2. Market Analysis

### 2.1 Industry Size & Growth
| Metric | Value |
|---|---|
| Australian cleaning industry revenue (2025) | $20.2 billion |
| CAGR 2020–2025 | 5.9% |
| Number of businesses | 44,775 |
| Largest segment | Commercial office cleaning (35–40%) |
| NSW market share | 32% |
| VIC market share | 26% |
| QLD market share | 20% |

### 2.2 Pricing Benchmarks (what clients pay)
| Service Type | Typical Rate |
|---|---|
| General office cleaning (per sqm) | $2–$8 AUD |
| Hourly rate (standard) | $40–$65 AUD/hr |
| Small office, weekly visit (up to 150 sqm) | $90–$160 per visit |
| Medium office, weekly visit (150–500 sqm) | $160–$380 per visit |
| Large office, weekly visit (500+ sqm) | $380–$900+ per visit |
| Washroom sanitisation | $20–$50 per washroom |
| Kitchen/break room | $40–$100 per visit |
| Window cleaning | $10–$20 per window |
| Minimum engagement charge | ~$165 + GST |

### 2.3 Target Client Profile
- **Primary:** SME office tenants 150–2,000 sqm (the sweet spot — too small for enterprise contracts, too professional for sole traders)
- **Secondary:** Retail premises, medical/allied health practices, gyms, childcare centres, strata buildings
- **City focus:** Capital cities where office density is highest and clients value professionalism

### 2.4 Competitive Landscape
| Competitor Type | Weakness | Our Edge |
|---|---|---|
| Local sole traders | No web presence, no online quoting | Professional portal + instant quotes |
| Large nationals (Spotless, ISS) | Ignore SME market, slow quoting | Speed + self-service |
| Franchise networks (e.g. Jani-King) | Fixed systems, less agile | Transparent pricing, online booking |
| Other digital platforms | Usually aggregators, not operators | Direct service, relationship-owned |

---

## 3. Business Model & Revenue Streams

### 3.1 Primary Model: Owner-Operator System
Secure Contracts operates an **Owner-Operator** model — a proven commercial cleaning industry structure with two distinct revenue streams:

**How it works:**
1. We win a client and agree on a detailed cleaning specification and price
2. We sell the contract rights to a vetted, experienced Owner-Operator (they buy the business)
3. The Owner-Operator services the site; we invoice the client and pay the OO their rate
4. We retain an ongoing margin on every clean — forever, for that client

**Two income streams per client:**
- **Upfront:** Contract sale price (3–6× monthly value) when placing the Owner-Operator
- **Recurring:** ~30–35% margin on every clean for the life of the contract

**Why Owner-Operators outperform employees:**
Their money is on the line. A cleaner who has *purchased* the right to service a site will not risk losing that investment. This is the core pitch to clients — and it's genuinely true.

*(Full detail in Section 16)*

### 3.2 Revenue Streams
1. **Contract sale income** — upfront payment when an Owner-Operator purchases a client contract (3–6× monthly value); a cash event every time we win a new client
2. **Ongoing service margin** — ~30–35% of every clean invoice for the life of the contract; pure recurring revenue
3. **Initial spring clean** — 2–3× standard clean price; recommended on every new client; high-margin one-off
4. **Consumables supply** — toilet paper, soap, sanitiser etc. sold at a margin; recurring secondary revenue
5. **Specialised/one-off cleans** — end-of-lease, post-construction, deep cleans (higher margin)
6. **Future: expand cities / license model** — roll the platform out to additional cities or license to other operators

### 3.3 Unit Economics (Owner-Operator Model — illustrative)

**Per new client won:**
| Client Type | Monthly Client Fee | Contract Sale Price (4×) | Monthly Margin (32%) | Year 1 Total |
|---|---|---|---|---|
| Small (1x/wk, $130/clean) | $520 | $2,080 upfront | $166/mo | $4,072 |
| Medium (3x/wk, $250/clean) | $3,000 | $12,000 upfront | $960/mo | $23,520 |
| Large (daily, $250/clean) | $5,500 | $22,000 upfront | $1,760/mo | $43,120 |

**Portfolio view (20 active clients, mixed):**
| Metric | Estimate |
|---|---|
| Monthly recurring margin | ~$12,000–$18,000 |
| Contract sale income (2 new clients/mo) | ~$15,000–$24,000 |
| Total monthly income | ~$27,000–$42,000 |

As the recurring base grows, the business shifts from "hustle for new contracts" to "passive income machine".

---

## 4. Product: The Online Portal

### 4.1 Overview
The portal has four primary functions:
1. **Landing / marketing pages** — convince clients to use us
2. **Instant Quote Calculator** — takes inputs, returns a ballpark figure + email quote
3. **Booking system** — schedule in-person inspection appointment
4. **AI Chat Assistant** — 24/7 customer support and lead qualification

### 4.2 Client Journey (end-to-end)

```
Client finds us (Google/ads/referral)
        ↓
Landing page — what we do, who we serve, cities covered
        ↓
Quote Calculator — enters details about their premises
        ↓
Indicative quote shown on-screen + emailed instantly
        ↓
CTA: "Book a free site inspection"
        ↓
Booking page — picks city, date, time slot
        ↓
Confirmation email (client) + calendar event (inspector)
        ↓
AI chat available at every step for questions
        ↓
Post-inspection: final quote → contract → ongoing service
```

### 4.3 Quote Calculator Inputs
**Step 1 — About Your Business**
- Business name
- Contact name, email, phone
- City / suburb
- Type of premises (Office / Medical / Retail / Warehouse / Gym / Childcare / Other)

**Step 2 — Your Space**
- Approximate floor area (sqm) — slider with size guide
- Number of levels/floors
- Number of bathrooms/toilets
- Number of kitchen/break rooms
- Number of meeting rooms
- Flooring type (carpet / hard floor / mixed)
- Number of large windows (external)

**Step 3 — What You Need**
- Service frequency (Daily / 3x/wk / 2x/wk / Weekly / Fortnightly / One-off)
- Time preference (After hours / Business hours / Flexible)
- Add-ons (tick boxes): Window cleaning / Carpet steam / Kitchen deep clean / Consumables supplied (soap, paper towel, etc.) / Pressure washing / High-touch disinfection protocol

**Step 4 — Extra Info**
- Specific requirements or notes (free text)
- How did you hear about us?
- Preferred start date

### 4.4 Output
- On-screen: "Your estimated weekly cleaning cost is **$XXX–$XXX + GST**"
- "This is an indicative range. A free site inspection confirms your final quote."
- Instant branded email with the quote summary, service details, and booking CTA

---

## 5. Quoting Engine — Logic & Pricing Model

### 5.1 Base Rate Formula
```
Base Time (hours) = Floor Area (sqm) ÷ 400  [cleanable sqm/hr average]
Base Labour Cost = Base Time × Hourly Rate ($55 default)
```

### 5.2 Modifier Matrix
| Factor | Multiplier |
|---|---|
| Medical/healthcare premises | ×1.4 |
| Industrial/warehouse | ×1.2 |
| Childcare/education | ×1.3 |
| Multi-storey (per extra floor) | ×1.1 |
| After-hours requirement | ×1.25 |
| Weekend requirement | ×1.5 |
| High foot traffic (retail/gym) | ×1.15 |

### 5.3 Add-On Costs
| Add-On | Unit Cost (AUD) |
|---|---|
| Bathrooms | $30/bathroom/visit |
| Kitchen/break room | $50/kitchen/visit |
| External windows | $15/window/visit |
| Carpet steam clean | Quoted separately (periodic) |
| Consumables supply | +$15–$40/visit flat |
| High-touch disinfection | +$0.80/sqm |

### 5.4 Frequency Discount
| Frequency | Discount |
|---|---|
| Daily | 0% (base rate) |
| 3x/week | 0% |
| Weekly | +5% (less frequent = slightly more per visit) |
| Fortnightly | +10% |
| One-off | +25% |

### 5.5 City Multiplier
| City | Multiplier |
|---|---|
| Sydney | ×1.10 |
| Melbourne | ×1.08 |
| Brisbane | ×1.00 |
| Perth | ×1.05 |
| Adelaide | ×0.95 |
| Canberra | ×1.02 |

### 5.6 Output Range
Show client a **range** (±15%) rather than a precise figure, e.g. "$180–$245 per visit"
This is intentional — it sets expectations, invites booking, and protects us from being held to a precise number before site inspection.

### 5.7 Minimum Charge
Apply a floor of **$165 + GST per visit** to all quotes.

---

## 6. Booking System & Calendar Management

### 6.1 How It Works
After receiving a quote, clients click through to book a **free site inspection**. This is a physical visit by an inspector/sales rep to:
- Walk the site
- Confirm the scope
- Present a formal contract-ready quote

### 6.2 Booking Inputs
- Preferred city
- Date selection (calendar widget, showing available slots)
- Time preference (AM / PM / Specific)
- Site address
- Client contact name & phone
- Any access notes

### 6.3 Availability Logic
**Inspector roster:** Each capital city has one (or more) designated inspectors. Their availability is pre-loaded as a schedule (e.g. Mon–Fri, 8am–5pm, max 4 bookings/day, 1hr per booking slot).

**Conflict prevention:**
- Bookings are written to a shared calendar (Google Calendar or CalDAV)
- Slots are greyed out in real-time as they fill
- Buffer time (30 min) between appointments for travel
- City-based filtering so Sydney clients only see Sydney slots

**Confirmation flow:**
1. Client selects slot → confirmation page
2. Client receives email: appointment details + calendar invite (.ics)
3. Inspector receives email notification + Google Calendar event auto-created
4. 24hr reminder email to client
5. 2hr reminder SMS (optional Phase 2)

### 6.4 Rescheduling & Cancellation
- Client can reschedule via link in confirmation email (up to 24hrs before)
- Cancellations auto-free the slot
- Inspector notified of changes in real-time

### 6.5 Calendar Backend Options
| Option | Pros | Cons |
|---|---|---|
| Google Calendar API | Free, familiar, works with Google Workspace | Needs OAuth setup |
| Calendly + webhook | Quick to implement, polished UX | Monthly cost, less control |
| Cal.com (self-hosted) | Open-source, full control, free | More setup effort |
| Custom DB calendar | Full control, no dependencies | Most build time |

**Recommendation:** Start with **Google Calendar API** (free, robust) or **Cal.com** (open source). Both integrate well with our stack.

---

## 7. Database Architecture

### 7.1 Core Tables / Collections

**clients**
```
id, business_name, contact_name, email, phone, city, suburb,
premises_type, created_at, source (how they found us), status
```

**quotes**
```
id, client_id, floor_area_sqm, num_floors, num_bathrooms,
num_kitchens, num_meeting_rooms, flooring_type, num_windows,
frequency, time_preference, add_ons (JSON), city, multipliers (JSON),
base_cost, final_cost_low, final_cost_high, notes,
created_at, quote_ref, email_sent_at
```

**bookings**
```
id, client_id, quote_id, inspector_id, city, address,
access_notes, appointment_datetime, status (pending/confirmed/completed/cancelled),
calendar_event_id, created_at, confirmed_at, reminder_sent
```

**inspectors**
```
id, name, email, phone, city, calendar_id,
availability_schedule (JSON), active
```

**availability_blocks**
```
id, inspector_id, date, time_from, time_to, is_blocked, reason
```

**leads** *(anyone who started but didn't complete)*
```
id, email, step_reached, data_so_far (JSON), created_at
```

**ai_chat_sessions**
```
id, client_id (nullable), session_token, messages (JSON),
created_at, resolved
```

### 7.2 Database Technology Choice
| Option | Use Case | Notes |
|---|---|---|
| **PostgreSQL** | Primary choice — relational, powerful | Free, hosted free tier on Supabase |
| **Supabase** | Managed Postgres + auth + real-time | Excellent free tier, great DX |
| **MongoDB** | If we need flexible schema early | Overkill for this structure |
| **SQLite** | Local dev only | Not for production |

**Recommendation: Supabase** — managed Postgres, built-in auth, REST API auto-generated, generous free tier, real-time subscriptions, and a clean admin dashboard you can use to view/manage client data without building a custom admin panel immediately.

### 7.3 Your Admin Access
You'll access client data, quotes, and bookings via:
1. **Supabase dashboard** (web UI — view/filter/export tables)
2. **Custom admin panel** (Phase 2 build — see plan)
3. **CSV export** available from Supabase at any time

---

## 8. AI Customer Support Agent

### 8.1 Role
A 24/7 AI chat assistant embedded on the portal that can:
- Answer FAQs (what's included, coverage areas, pricing guidance, process)
- Help users through the quote calculator if confused
- Qualify leads (ask about their needs, push toward booking)
- Escalate to human follow-up (flag urgent or high-value leads)
- Take contact details if a full quote isn't needed

### 8.2 Technical Approach
**Option A: OpenClaw-hosted agent (recommended)**
- Deploy a custom AI agent within the OpenClaw framework
- Use Claude or GPT depending on task
- The agent has access to a knowledge base (your service details, pricing FAQs, coverage areas)
- Can write leads to the database
- Can be embedded as a chat widget on the website

**Option B: Third-party chat (e.g. Intercom, Tidio, Crisp)**
- Faster to set up
- Less customised
- Monthly cost
- Less control over AI behaviour

**Option C: Custom LLM via API (Vercel AI SDK)**
- Build a chat widget with streaming responses
- System prompt defines the persona and knowledge
- Tied into our backend to look up quote data if needed

**Recommendation:** Start with a **custom embedded widget** using Claude via API, with a well-crafted system prompt. OpenClaw can manage this directly. Add an escalation trigger so anything complex gets flagged for human follow-up (email to you).

### 8.3 Agent Knowledge Base
The AI should know:
- Your service offerings (what's included/excluded)
- Cities covered and inspector availability (general)
- How the quoting system works
- The booking process
- Pricing ranges (not exact — to avoid committing before inspection)
- Common objections and how to handle them
- Company values / tone of voice
- "I'll arrange a callback" escalation path

### 8.4 Persona
- Name: e.g. "Max" or "Clara" (to be decided)
- Tone: professional, efficient, warm — not robotic
- Never promises a specific price — always references the calculator + site visit
- Always pushes toward the two CTAs: get a quote, book an inspection

---

## 9. Back-End Website Structure

### 9.1 Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| **Frontend** | Next.js (React) | Fast, SEO-friendly, full-stack capability |
| **Styling** | Tailwind CSS | Clean, rapid UI development |
| **Backend / API** | Next.js API routes or separate Node/Express | Co-located with frontend |
| **Database** | Supabase (PostgreSQL) | Managed, real-time, auth built-in |
| **Email** | Resend or SendGrid | Transactional emails, templates |
| **Calendar** | Google Calendar API or Cal.com | Appointment management |
| **AI Chat** | Anthropic Claude API | 24/7 assistant |
| **File storage** | Supabase Storage or Cloudflare R2 | Quote PDFs, attachments |
| **Auth (admin)** | Supabase Auth | Secure admin login |
| **Hosting** | Vercel (frontend) + Supabase (backend) | Free tiers, scalable |
| **Domain** | Custom .com.au | Professional, local trust signal |

### 9.2 Page Structure

```
/                           → Home / Landing page
/quote                      → Step-by-step quote calculator
/quote/result               → Quote result + email capture
/booking                    → Inspection booking (post-quote CTA)
/booking/confirm            → Booking confirmation page
/services                   → Service pages (office, medical, retail, etc.)
/cities                     → City landing pages (Sydney, Melbourne, etc.)
/cities/[city]              → Per-city page (SEO + local details)
/about                      → About the business
/contact                    → Contact form
/faq                        → FAQ page
/blog                       → (Phase 2) Content marketing
/admin                      → Admin dashboard (private, auth-gated)
/admin/quotes               → View all quotes submitted
/admin/bookings             → Manage inspection bookings
/admin/clients              → Client database
/admin/calendar             → Inspector calendar view
```

### 9.3 Admin Panel Features (Phase 2)
- View all submitted quotes with filters (city, date, premises type)
- View and manage bookings (confirm, reschedule, complete, cancel)
- Client database with status tracking (lead → quoted → inspected → contracted → active)
- Basic reporting: submissions per week, conversion rate, revenue pipeline
- Notes/annotations per client

### 9.4 Quote Email Template

The **online calculator email** is an indicative/ballpark quote to get the client to book an inspection.
The **post-inspection formal quote** is the detailed specification-based document sent after the site visit.

**Online Calculator Quote Email — structure:**
- Logo + brand header
- Personalised greeting: "Thank you for your enquiry, [Name]"
- Summary of their premises details
- Estimated weekly cost range: "$XXX–$XXX + GST per clean, [X]x per week"
- What's included (labour, chemicals, equipment — based on selections)
- Spring clean recommendation: "We recommend an optional one-off spring clean ($XXX–$XXX) to bring your premises to a maintainable standard from day one"
- Consumables note (if selected): link to price list
- CTA button: **"Book Your Free Site Inspection"**
- Why Secure Contracts — short bullet points (Owner-Operator model, police checked, insured, no lock-in)
- Footer with contact details, ABN, unsubscribe

**Post-Inspection Formal Quote Email — structure (matches the reference example style):**
- "Thank you for meeting with me recently and for showing me around your premises."
- "I have compiled a detailed specification including all areas as shown, and marked the frequency of cleaning on each area as required."
- Total price per clean + frequency + timing + access method
- "Pricing includes all labour, chemicals and equipment to complete all tasks as per the specification."
- **"Click here to review your specification"** (link to specification document — PDF or web view)
- Invitation to adjust: "Please review the specification carefully and advise if any areas need to be added, removed, or frequency changed. Any changes will impact price accordingly — we can structure the schedule to suit your budget."
- Spring clean upsell paragraph
- Consumables upsell (if applicable) — link to price list
- **"Why choose Secure Contracts"** section:
  - No lock-in contract
  - Real experienced cleaners — not casual earners
  - Owner-Operator model — your cleaner has invested in your site; 100% financially committed
  - Police checked, insured, right-to-work verified, OH&S compliant, MSDS provided, colour-coded cleaning
  - Site induction — alarms, access, emergency procedures
  - You meet your cleaner before they start; direct contact number provided
  - Multiple communication options: app, web portal, email, SMS, phone, on-site communication book
  - We monitor all compliance requirements to protect you from liability
- Sign-off: "I look forward to hearing from you"

---

## 10. Email & Communication System

### 10.1 Transactional Emails (Automated)
| Trigger | Recipient | Content |
|---|---|---|
| Quote submitted | Client | Quote summary + booking CTA |
| Booking confirmed | Client | Appointment details + calendar invite |
| Booking confirmed | Inspector | New appointment notification |
| 24hr reminder | Client | Appointment reminder |
| 24hr reminder | Inspector | Daily schedule summary |
| Booking reschedule | Both | Updated details |
| Booking cancellation | Both | Notification |

### 10.2 Email Service Options
| Service | Free Tier | Notes |
|---|---|---|
| **Resend** | 3,000/month | Clean API, React Email templates, recommended |
| **SendGrid** | 100/day | Reliable, feature-rich |
| **Mailgun** | 100/day | Developer-friendly |
| **Postmark** | 100/month free | Best deliverability |

**Recommendation: Resend** — modern API, excellent React/Next.js integration, generous free tier.

### 10.3 Email Design
- Use **React Email** templates for pixel-perfect, responsive HTML emails
- Consistent branding (logo, colours, fonts)
- Mobile-optimised (60%+ of emails opened on mobile)
- Include calendar attachment (.ics) for booking emails

---

## 11. Marketing Strategy

### 11.1 Phase 1 — Zero Budget (Organic)

**Google Business Profile**
- Set up a free Google Business Profile for each capital city (or one national profile)
- Category: "Commercial Cleaning Service"
- Add photos, services, operating hours
- Encourage early clients to leave reviews
- This drives local map pack visibility — free and high-intent traffic

**SEO — Local Landing Pages**
- Create city-specific pages: `/cities/sydney-commercial-cleaning`, `/cities/melbourne-commercial-cleaning` etc.
- Target keywords: "commercial cleaning Sydney", "office cleaning Melbourne quote", "commercial cleaning Brisbane price"
- These pages rank over time and become free traffic machines
- Content: pricing info, what's included, local trust signals

**On-Site Content**
- FAQ page targeting long-tail questions ("how much does office cleaning cost in Melbourne?")
- Blog post examples: "How to choose a commercial cleaner in Sydney", "What's included in a commercial clean?"

### 11.2 Phase 2 — Paid Acquisition (once some revenue flows)

**Google Ads (Search)**
- Target high-intent keywords: "commercial cleaning quote", "office cleaning [city]", "commercial cleaning company near me"
- Link directly to the quote calculator — best possible conversion path
- Budget: start at $20–$50/day per city, scale with ROI
- Expected CPL (cost per lead): $30–$80 AUD

**Meta Ads (Facebook/Instagram)**
- Retargeting visitors who visited but didn't complete a quote
- "Still need a cleaner? Get an instant quote →"
- Good for brand awareness in local areas

**LinkedIn Ads (Phase 3)**
- Target office managers, facility managers, HR managers
- Effective for corporate/enterprise leads
- Higher CPL but higher contract value

### 11.3 Partnerships & Referrals
- **Real estate agents / commercial property managers** — refer clients during lease sign-up (offer referral fee or co-branded collateral)
- **Building managers / strata companies** — ongoing tender for building contracts
- **Office fitout companies** — post-fitout cleans (leads for ongoing contracts)
- **HR platforms** — office managers are on them; explore co-marketing

### 11.4 Key Metrics to Track
| Metric | Target (Month 3) |
|---|---|
| Website visitors | 500+/month |
| Quote submissions | 30+/month |
| Booking conversions | 10+/month |
| Contracts signed | 5+/month |
| Monthly recurring revenue | $5,000+ |

---

## 12. Deployment Plan

### 12.1 Hosting Architecture

```
User Browser
    ↓
Vercel (Next.js frontend + API routes)
    ↓                    ↓
Supabase (DB + Auth)   External APIs:
                         - Google Calendar
                         - Resend (email)
                         - Anthropic (AI chat)
```

### 12.2 Environments
| Environment | Purpose | URL |
|---|---|---|
| Development | Local build and testing | localhost:3000 |
| Staging | Pre-release testing | staging.yourdomain.com.au |
| Production | Live site | yourdomain.com.au |

### 12.3 Deployment Steps
1. Set up GitHub repository (private)
2. Connect repo to Vercel (auto-deploy on push to main)
3. Set up Supabase project (free tier to start)
4. Configure environment variables (API keys, database URL)
5. Purchase domain (.com.au) — ~$20/yr via Crazy Domains, VentraIP, or Namecheap
6. Configure DNS to point to Vercel
7. SSL certificate — automatic via Vercel
8. Set up Resend account and verify domain for email
9. Google Calendar API credentials for booking system
10. Anthropic API key for AI chat

### 12.4 Cost at Launch (Monthly)
| Service | Plan | Monthly Cost |
|---|---|---|
| Vercel | Hobby (free) or Pro ($20/mo) | $0–$20 |
| Supabase | Free tier (generous) | $0 |
| Resend | Free (3,000 emails/mo) | $0 |
| Anthropic API | Pay per use (~$0.003/message) | $5–$20 est. |
| Google Workspace (email + calendar) | Starter | $10–$15 AUD |
| Domain (.com.au) | Annual | ~$2/mo |
| **Total estimate** | | **~$17–$57 AUD/month** |

Very lean launch cost. Scale Supabase/Vercel plans only as traffic demands.

---

## 13. Hardware Requirements

### 13.1 For Development & Operations (Your End)
- A modern laptop/desktop is sufficient for all development and admin tasks
- No dedicated server required — fully cloud-hosted
- A smartphone for testing mobile UX and receiving push notifications

### 13.2 For Inspectors in the Field
- **Smartphone** — to receive email/SMS notifications of bookings
- **Google Calendar app** — to see their daily schedule
- Optional: **Tablet** to show the client their quote on-site, take notes, and confirm details

### 13.3 No On-Premises Infrastructure Required
Everything runs on cloud services. There is no hardware to purchase, rack, or maintain. The only hardware cost is:
- Your own development machine (already owned)
- Your own mobile device (already owned)

If this scales to a full operations team, you might later consider:
- A shared team Google Workspace account ($10–$15/user/month)
- A shared operations phone/tablet for inspectors

---

## 14. Financial Projections

### 14.1 Startup Costs (One-Time)
| Item | Estimated Cost |
|---|---|
| Domain registration | $20 AUD |
| Logo / branding (Canva Pro or freelancer) | $0–$200 |
| Development time (us building it) | $0 (our work) |
| Initial Google Ads credit (optional) | $0–$500 |
| **Total launch cost** | **$20–$720 AUD** |

### 14.2 Monthly Operating Costs (Launch Phase)
| Item | Monthly Cost |
|---|---|
| Hosting + services (see §12.4) | $17–$57 |
| Google Ads (optional Phase 2) | $0–$1,500 |
| **Total operating** | **$17–$1,557 AUD** |

### 14.3 Revenue Scenarios
| Scenario | Clients | Avg Monthly/Client | Monthly Revenue |
|---|---|---|---|
| Launch (Month 3) | 5 | $1,200 | $6,000 |
| Growing (Month 6) | 15 | $1,400 | $21,000 |
| Established (Month 12) | 30 | $1,600 | $48,000 |

Note: These are gross revenue figures. Labour (cleaners) is the primary cost — typically 55–65% of revenue, leaving 35–45% gross margin before overheads.

---

## 15. Phased Build Plan

### Phase 1 — Foundation (Weeks 1–3)
**Goal:** Working portal with quote calculator and email delivery
- [ ] Finalise business name, branding, domain
- [ ] Set up project repo (GitHub)
- [ ] Set up Supabase project + define schema
- [ ] Build quote calculator (multi-step form)
- [ ] Build quoting engine logic
- [ ] Quote result page + email template
- [ ] Set up Resend email delivery
- [ ] Basic landing page (hero, services, cities, CTA)
- [ ] Deploy to Vercel on custom domain

### Phase 2 — Booking System (Weeks 4–6)
**Goal:** End-to-end lead flow including appointment booking
- [ ] Inspector availability setup (Google Calendar or Cal.com)
- [ ] Booking form with city/date/time selection
- [ ] Booking confirmation emails + .ics calendar invite
- [ ] Database: bookings, inspectors, availability tables
- [ ] Admin: basic Supabase dashboard view (no custom UI yet)
- [ ] 24hr reminder email job

### Phase 3 — AI Assistant (Weeks 7–9)
**Goal:** 24/7 chat available on all pages
- [ ] Design AI knowledge base (FAQs, pricing guidance, process)
- [ ] Build chat widget (floating button, slide-out panel)
- [ ] Connect to Claude API with system prompt
- [ ] Escalation trigger → email notification to admin
- [ ] Session logging to database
- [ ] Test edge cases, tune system prompt

### Phase 4 — Admin Panel & Polish (Weeks 10–12)
**Goal:** Operational control and marketing readiness
- [ ] Admin dashboard (custom UI): quotes, bookings, clients, calendar
- [ ] Client status tracking (lead → contracted → active)
- [ ] City SEO landing pages
- [ ] Google Business Profile set up
- [ ] Analytics (Vercel Analytics + Google Search Console)
- [ ] Mobile UX polish
- [ ] Final QA and load testing
- [ ] Soft launch → gather feedback → iterate

### Phase 5 — Marketing & Scale (Month 4+)
- [ ] Google Ads campaign (search, quote calculator landing page)
- [ ] Referral partner outreach
- [ ] Blog content (SEO)
- [ ] SMS reminders
- [ ] Client portal (view past quotes, manage bookings)
- [ ] Multi-inspector per city support

---

## 16. Owner-Operator Model — Full Detail

This section replaces the generic broker framing. The model Secure Contracts uses is specifically an **Owner-Operator system** — a well-established commercial cleaning industry structure where the cleaner **purchases the right to service a client site**. This is meaningfully different from a standard subcontractor arrangement and has important legal, financial, and quality implications.

---

### 16.1 How the Owner-Operator Model Works

1. **We win the client.** Secure Contracts signs a cleaning services agreement with the client business. We are the service provider in the client's eyes — they pay us.

2. **We price the contract.** We build a detailed cleaning specification (scope of works) with the client post-inspection. This defines every area, task, and frequency. The agreed fee (e.g. $250 + GST per clean, 3x/week) becomes the contract value.

3. **We sell the contract to an Owner-Operator.** We approach our vetted pool of experienced cleaners and offer them the opportunity to purchase the right to service that site. The Owner-Operator pays us a **purchase price for the contract** (typically a multiple of the monthly contract value — e.g. 3–6× monthly = the "goodwill" payment). This is their investment.

4. **The Owner-Operator services the site directly.** They have purchased a business — their client. They attend the site, deliver the cleaning to the specification, and manage their own schedule and team (if applicable).

5. **We invoice the client; the Owner-Operator invoices us.** The client pays Secure Contracts. We pay the Owner-Operator their agreed rate (e.g. 65–70% of the client fee). We retain our margin.

6. **We manage the relationship and compliance.** We handle communication, quality oversight, compliance monitoring (insurance, police checks, right-to-work), and client satisfaction. If an Owner-Operator underperforms, we intervene; in extremis, the contract can be reassigned.

---

### 16.2 Why This Model is Legally Clean

The Owner-Operator **buys** the contract — this is a genuine commercial transaction. They have:
- Paid capital to acquire the business right
- Their own ABN and business identity
- A financial incentive (their investment is at risk if they lose the client)
- Freedom to operate the site as they see fit (within the agreed specification)
- The right to employ their own staff or work alone

This is **not a sham contracting situation** because the economic reality matches the legal form: the Owner-Operator is a business person who has purchased a business asset. The relationship is buyer/seller of contract rights, not employer/employee.

Still recommended: have a lawyer review/draft your standard Owner-Operator Agreement and Contract Sale Agreement — mainly for protection of both parties, not because the model is risky.

---

### 16.3 Why Owner-Operators Perform Better Than Employees

This is the core sales proposition — and it's genuinely true:

| Factor | Employee Cleaner | Owner-Operator |
|---|---|---|
| Financial stake in the job | None | Yes — bought the contract |
| Attitude to client relationship | "Just a job" | "This is my business" |
| Risk of losing the site | Minimal personal impact | Loss of their investment |
| Motivation to go above and beyond | Low | High |
| Tenure / stability | High turnover | Stays long-term |
| Professionalism | Variable | Screened and invested |

A cleaner who has paid to own a contract **will not risk losing it**. This is the key differentiator Secure Contracts sells to clients — and it's a genuinely compelling argument.

---

### 16.4 Revenue Model (Revised)

Secure Contracts earns from **two distinct sources**:

**Stream 1 — Ongoing service margin (recurring)**
- Client pays us the full clean fee (e.g. $250/clean × 3/week = $750/week)
- We pay the Owner-Operator their rate (e.g. 68% = $510/week)
- We retain **32% = $240/week = ~$960/month** per client — forever, as long as the contract runs

**Stream 2 — Contract sale income (upfront)**
- When we place a new Owner-Operator, we sell them the contract rights
- Typical price: **3–6× monthly client contract value**
- e.g. Client pays $3,000/month → contract sold to Owner-Operator for **$9,000–$18,000**
- This is a significant upfront cash event each time we win a new client

**Combined example — one new client:**
| Item | Value |
|---|---|
| Monthly client fee | $3,000 |
| Contract sale price (4× multiple) | $12,000 upfront |
| Monthly margin (32%) | $960/month recurring |
| Year 1 total income from this one client | $12,000 + ($960 × 12) = **$23,520** |
| Year 2+ (recurring only) | **$11,520/year passively** |

This is a very attractive business model — each new client generates a cash injection AND a recurring income stream.

---

### 16.5 Updated Unit Economics

| Scenario | Active Clients | Avg Monthly Fee | Contract Sale (avg) | Monthly Recurring Margin | Monthly Income |
|---|---|---|---|---|---|
| Launch (Month 3) | 5 | $1,500 | 1 new client/mo × $6,000 | $2,400 | ~$8,400 |
| Growing (Month 6) | 15 | $2,000 | 2 new clients/mo × $8,000 | $9,600 | ~$25,600 |
| Established (Month 12) | 30 | $2,200 | 2 new clients/mo × $9,000 | $21,120 | ~$39,120 |

As the recurring base builds, dependency on new contract sales reduces — you transition from growth income to passive income.

---

### 16.6 Key Client Selling Points (for website + quote emails)

Modelled on the "Why Choose Us" section from the reference example:

1. **No lock-in contract** — if our cleaner doesn't perform, cancel any time
2. **Real professionals** — not casual earners; experienced cleaners who have invested in your site
3. **Owner-Operator model** — your cleaner has purchased the right to service you; they are financially committed to your satisfaction
4. **Fully verified** — Police checked, insured (public liability), right-to-work confirmed, OH&S compliant, MSDS/SDS provided for all chemicals, colour-coded cleaning protocols
5. **Site induction** — your cleaner is inducted into your premises (alarms, access, emergency exits, OH&S systems)
6. **You meet your cleaner** before they start + you get their direct contact number
7. **Multiple communication options** — app, website portal, email, SMS, phone, communication book on-site
8. **We monitor compliance** — ongoing checks on insurance, right-to-work, standards; we protect you from liability

---

### 16.7 The Initial Spring Clean

As per the reference model, always include an **optional (but recommended) spring clean** at quote stage:
- Price: 2–3× the standard clean price
- Purpose: bring the premises to a maintainable standard before the recurring schedule begins
- Positioning: "We strongly recommend this — it ensures your site is at a high level of cleanliness from day one"
- This is a meaningful one-off revenue boost on every new client

The quote engine should **always include this as a recommended add-on** on the result page and in the quote email.

---

### 16.8 Consumables Supply

Offer consumables supply as a separate optional service (toilet paper, hand soap, paper towel, bin liners, hand sanitiser):
- Priced as a separate line item or click-through price list
- Purchased in bulk, sold at a margin
- Creates a secondary recurring revenue stream
- Convenience factor is a genuine value-add for clients

---

### 16.9 Owner-Operator Database (DB tables)

**owner_operators**
```
id, name, email, phone, abn, city, suburb,
experience_years, specialisations (JSON),
police_check_date, police_check_expiry,
insurance_provider, insurance_expiry, insurance_policy_no,
right_to_work_verified, induction_completed,
status (active/suspended/inactive),
avg_client_rating, total_contracts_held,
joined_date, notes
```

**contract_sales**
```
id, client_id, owner_operator_id, sale_price,
sale_date, monthly_client_fee, oo_rate_pct,
contract_start_date, status (active/terminated/transferred)
```

**owner_operator_ratings**
```
id, owner_operator_id, client_id, visit_date,
rating (1-5), comment, created_at, flagged
```

---

### 16.10 Owner-Operator Recruitment

Before accepting clients, build a vetted roster:
- **Target:** 5–8 Owner-Operators per city at launch
- **Sources:** Seek, Indeed, Facebook groups (professional cleaners), direct outreach to experienced sole-traders currently working under larger companies
- **Screening:** Interview, reference checks, ABN verification, police check, insurance confirmation, site induction process
- **Pitch to them:** "Buy a client. Own a business. Keep your income. We handle the sales, admin, and compliance — you just clean."

---

## 17. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Quote engine too inaccurate → client disappointment | Medium | High | Always show a range, strong disclaimer, site visit required |
| Inspector calendar conflicts | Medium | Medium | Buffer time, real-time slot locking, confirmation emails |
| Low initial traffic | High | Medium | Google Business Profile + SEO from day 1 |
| Email deliverability issues | Low | High | Use reputable service (Resend), verify domain, test before launch |
| AI agent gives wrong info | Medium | Medium | Carefully tuned system prompt, no exact pricing quotes by AI |
| Data breach / client PII | Low | Very High | Supabase RLS (row-level security), no PCI data stored, HTTPS everywhere |
| Competition copying the model | Medium | Low | First-mover advantage, local reviews, relationships |
| Sham contracting allegation | Low (OO model is structurally sound) | Very High | OO purchase model is genuine commercial transaction; lawyer reviews standard agreements |
| Owner-Operator no-show / poor quality | Medium | High | Vetting process, backup OO roster per city, quality rating system, rapid reassignment |
| OO recruitment shortage pre-launch | High (early stage) | High | Start recruitment before taking first client; 5+ vetted OOs per city before going live |
| Client disputes over cleaning standard | Medium | Medium | Detailed spec of works in contract, post-clean rating system, rapid resolution process |
| OO loses insurance / compliance lapses | Low | High | Automated expiry tracking in DB; alerts 30 days before expiry; suspend if lapsed |
| Client cancels before OO recoups investment | Medium | Medium | No-lock-in is the pitch — OO understands this risk; priced into contract sale multiple |

---

## Next Steps

**Decisions confirmed:**
1. ✅ Business name: Secure Contracts Pty Ltd
2. ✅ Launch cities: Melbourne and Sydney
3. ✅ Model: Broker (place independent contractors, retain margin)

**Immediate actions before Phase 1 build:**
1. Decide on a **client-facing trading/brand name** for the website (separate from "Secure Contracts Pty Ltd" — the legal entity; the website trades under a registered business name)
2. Engage a **business lawyer** to review/draft: (a) Owner-Operator Agreement, (b) Contract Sale Agreement, (c) Client Services Agreement
3. Begin **Owner-Operator recruitment** in Melbourne and Sydney — target 5+ per city before accepting first clients
4. Register the **domain name** (.com.au) once brand name is decided
5. Set up **Google Workspace** (business email, shared calendar for site inspections)
6. **Kick off Phase 1 build** — quote calculator + landing page

*This document will evolve. Each phase will have its own detailed spec when we get to it.*

---
*Document maintained by Franky ⚡ | Last updated: 2026-03-18*
