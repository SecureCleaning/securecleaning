# Secure Cleaning — Commercial Cleaning Portal

A Next.js 14 web portal for **Secure Contracts Pty Ltd**, providing online quoting, booking, and AI-assisted enquiries for commercial cleaning services in Melbourne and Sydney.

---

## Tech Stack

- **Next.js 14** — App Router, TypeScript
- **Tailwind CSS** — Styling
- **Supabase** — Database + Auth + Row-Level Security
- **Resend** — Transactional email
- **Anthropic Claude** — AI chat assistant ("Max")
- **Google Calendar API** — booking follow-up / scheduling prep

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/secure-contracts/securecleaning.git
cd securecleaning
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials (see Environment Variables below).

### 4. Set up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In the SQL editor, run the full contents of `supabase/schema.sql`
3. Copy your project URL and keys into `.env.local`

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only — keep secret) |
| `RESEND_API_KEY` | Resend API key for transactional emails |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (AI chat) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the deployed site |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Refresh token used to write calendar events |
| `GOOGLE_CALENDAR_ID` | Target calendar ID (recommended: info@securecleaning.au) |
| `FROM_EMAIL` | Sender address for outbound emails |
| `ADMIN_EMAIL` | Admin notification email address |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page
│   ├── quote/              # Quote wizard
│   ├── booking/            # Booking flow
│   ├── services/           # Services overview
│   ├── cities/             # City landing pages (Melbourne, Sydney)
│   ├── about/              # About Secure Contracts
│   ├── contact/            # Contact page
│   ├── faq/                # FAQ
│   └── api/                # API route handlers
│       ├── quote/          # Quote submission endpoint
│       ├── booking/        # Booking endpoint
│       └── chat/           # AI chat (streaming)
├── components/
│   ├── layout/             # Header, Footer, Navigation
│   ├── quote/              # Multi-step quote form
│   ├── booking/            # Booking form + calendar
│   ├── chat/               # Chat widget (Max AI)
│   └── ui/                 # Reusable UI primitives
└── lib/
    ├── quoteEngine.ts      # Pricing calculation logic
    ├── supabase.ts         # Supabase client
    ├── email.ts            # Email helpers (Resend)
    └── types.ts            # TypeScript types
supabase/
└── schema.sql              # Full DB schema with RLS
```

---

## Quote Engine

The quote engine (`src/lib/quoteEngine.ts`) implements the full pricing formula:

- Base time = floor area ÷ 400 hours
- Base labour = hours × $55/hr
- Applies multipliers for: premises type, floors, after-hours, weekend, frequency, city
- Adds flat-rate add-ons: bathrooms, kitchens, windows, consumables, high-touch disinfection
- Minimum invoice: $165
- Returns a low–high price range (±10%), or spring clean pricing if selected

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Set all environment variables in the Vercel dashboard.

### Self-hosted

```bash
npm run build
npm start
```

---

## Licence

Proprietary — Secure Contracts Pty Ltd. All rights reserved.
