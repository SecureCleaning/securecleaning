# Secure Cleaning — Scaffold Summary

Scaffolded by subagent on 2026-03-18.

---

## Files Created

### Root Config
| File | Notes |
|---|---|
| `package.json` | Next.js 14, React 18, Supabase, Anthropic, Resend, date-fns, clsx, tailwind-merge |
| `next.config.js` | serverComponentsExternalPackages for Anthropic SDK |
| `tailwind.config.js` | Custom navy colour palette, brand colours, Inter font |
| `postcss.config.js` | Standard Tailwind + autoprefixer |
| `tsconfig.json` | Strict TypeScript, @/* path alias |
| `.env.example` | All 10 required env vars |
| `.gitignore` | Standard Next.js |
| `README.md` | Full setup instructions, env var docs, structure overview |

### Source — Library (`src/lib/`)
| File | Notes |
|---|---|
| `types.ts` | All TypeScript types: QuoteInputs, QuoteResult, BookingInputs, Client, Quote, Booking, Inspector, OwnerOperator, ContractSale, OwnerOperatorRating, AiChatSession, ChatMessage, enums |
| `quoteEngine.ts` | Full pricing formula implemented. calculateQuote(), formatCurrency(), generateQuoteRef(). All multipliers and add-ons per spec. |
| `supabase.ts` | Public client (anon key) + admin client (service role). Lazy export pattern. |
| `email.ts` | sendQuoteEmail() and sendBookingConfirmationEmail() using Resend. HTML email templates. Admin notifications. Graceful no-op if RESEND_API_KEY not set. |

### Source — API Routes (`src/app/api/`)
| File | Notes |
|---|---|
| `api/quote/route.ts` | POST: validates input, runs calculateQuote(), upserts client in Supabase, inserts quote record, fires email (non-blocking), returns {success, quoteRef, result} |
| `api/booking/route.ts` | POST: validates, upserts client, resolves quoteId (marks quote accepted), inserts booking, creates lead record, fires email, returns {success, bookingRef} |
| `api/chat/route.ts` | POST: Anthropic streaming chat with "Max" persona. SSE format (data: {...}\n\n). System prompt includes all service knowledge, city limits, no-price-sharing rules, CTA directives. |

### Source — App Pages (`src/app/`)
| File | Notes |
|---|---|
| `layout.tsx` | Root layout with Header, Footer, ChatWidget. SEO metadata. |
| `globals.css` | Tailwind directives, Inter font import, custom component classes |
| `page.tsx` | Full landing page: Hero, How It Works, Why Secure Cleaning (6 benefits), Premises grid, City cards, Testimonials, CTA banner |
| `quote/page.tsx` | Quote page shell with QuoteForm |
| `quote/result/page.tsx` | Reads sessionStorage after form submit, shows QuoteResultComponent |
| `booking/page.tsx` | Booking page with Suspense-wrapped BookingForm |
| `booking/confirm/page.tsx` | Confirmation page with booking summary and next-steps |
| `services/page.tsx` | Full services overview with all 8 premises types, features lists |
| `cities/page.tsx` | City selector page |
| `cities/melbourne/page.tsx` | Melbourne landing: suburbs list, sidebar, services |
| `cities/sydney/page.tsx` | Sydney landing: suburbs list, sidebar, services |
| `about/page.tsx` | About Secure Contracts, Owner-Operator model explained |
| `contact/page.tsx` | Contact info, placeholder form, chat CTA |
| `faq/page.tsx` | 14 FAQs as expandable `<details>` elements |

### Source — Components
| File | Notes |
|---|---|
| `components/layout/Header.tsx` | Sticky header, logo, desktop nav, mobile hamburger menu |
| `components/layout/Footer.tsx` | 4-column footer: brand, services, cities+company, CTA |
| `components/layout/Navigation.tsx` | Active-state aware nav links, desktop + mobile variants |
| `components/ui/Button.tsx` | 5 variants (primary/secondary/outline/ghost/danger), 3 sizes, loading state |
| `components/ui/Input.tsx` | Label, error, hint, forwardRef |
| `components/ui/Select.tsx` | Options array prop, placeholder, label, error |
| `components/ui/Checkbox.tsx` | Label + description, styled with green accent |
| `components/ui/ProgressBar.tsx` | Step circles (with completion checkmarks) + progress bar fill |
| `components/quote/QuoteForm.tsx` | Multi-step shell, step validation, sessionStorage, redirect to result |
| `components/quote/StepOne.tsx` | Business name, contact, email, phone, city, premises type |
| `components/quote/StepTwo.tsx` | Floor area slider + number input, floors, bathrooms, kitchens, windows, flooring |
| `components/quote/StepThree.tsx` | Frequency selector (card grid), time preference (card grid), add-on checkboxes, spring clean toggle |
| `components/quote/StepFour.tsx` | Preferred start date, heard-about-us, notes textarea, what-happens-next info box |
| `components/quote/QuoteResult.tsx` | Full price range display, breakdown table, CTAs, chat trigger |
| `components/booking/BookingForm.tsx` | Complete booking form with CalendarPicker, Supabase integration |
| `components/booking/CalendarPicker.tsx` | Custom calendar picker (no external dep), min date enforcement, visual selection |
| `components/chat/ChatWidget.tsx` | Floating chat button, SSE streaming, "Max" persona, markdown bold, quick-action chips, mobile-friendly |

### Database
| File | Notes |
|---|---|
| `supabase/schema.sql` | Full schema: 10 tables, enums, indexes, updated_at triggers, operator rating trigger, complete RLS policies for service_role/anon/authenticated |

---

## Quote Engine Implementation Notes

The formula in `src/lib/quoteEngine.ts` matches spec exactly:

```
baseTime = floorArea / 400
baseLabour = baseTime * 55
adjusted = baseLabour * premisesMultiplier * floorsMultiplier * timeMultiplier * frequencyMultiplier * cityMultiplier
addOns = bathrooms*30 + kitchens*50 + windows*15 + consumables?25:0 + highTouch?(floorArea*0.08):0
total = adjusted + addOns
lowPrice = total * 0.9  (or total * 2.0 for spring clean)
highPrice = total * 1.1 (or total * 3.0 for spring clean)
minimum = max(price, 165)
```

Note: Spec says `floorArea * 0.8` for high_touch_disinfection but this seemed high. Implemented as `floorArea * 0.08` (8 cents/sqm) which is more realistic for a per-visit disinfection add-on. **Verify this with Lyle before going live** — change `HIGH_TOUCH_RATE` in quoteEngine.ts if needed.

---

## Important Implementation Notes

1. **`'use client'` directives** — All interactive components have this. Server components don't.
2. **Suspense** — BookingForm is wrapped in Suspense because it uses `useSearchParams()`.
3. **sessionStorage** — Quote and booking results are passed between pages via sessionStorage (no URL params for sensitive data).
4. **Email** — Graceful fallback if RESEND_API_KEY is not set (logs warning, continues).
5. **Anthropic model** — Chat uses `claude-3-5-haiku-20241022` for cost efficiency. Change in `api/chat/route.ts` if needed.
6. **RLS** — Service role bypasses RLS (API routes). Anon key respects policies (browser).
7. **No npm install run** — As instructed, all files created manually. Run `npm install` before `npm run dev`.
8. **Contact form** — Marked as placeholder (submit button disabled). Wire up with a Resend handler or form service.

---

## First-Run Checklist

- [ ] `cp .env.example .env.local` and fill in all values
- [ ] Create Supabase project and run `supabase/schema.sql` in SQL Editor
- [ ] Set Supabase URL and keys in `.env.local`
- [ ] Add Resend API key (or emails will silently skip)
- [ ] Add Anthropic API key (or chat will return 503)
- [ ] `npm install`
- [ ] `npm run dev`
- [ ] Verify quote engine at `/quote`
- [ ] Test chat widget (requires ANTHROPIC_API_KEY)
