# Secure Cleaning Domain Cutover

## Target state
- Primary website: `https://securecleaning.com.au`
- Legacy website: `https://securecleaning.au` redirects to `https://securecleaning.com.au`
- Optional `www` hostnames also redirect to the apex `.com.au` domain

## App changes already made
- Canonical site URL defaults to `https://securecleaning.com.au`
- Metadata now uses `.com.au` as the canonical base URL
- `/robots.txt` and `/sitemap.xml` now publish the `.com.au` domain
- Requests arriving on `securecleaning.au`, `www.securecleaning.au`, or `www.securecleaning.com.au` are redirected to `securecleaning.com.au`

## Vercel steps
1. Open the project in Vercel.
2. Go to `Settings` -> `Domains`.
3. Add:
   - `securecleaning.com.au`
   - `www.securecleaning.com.au`
   - `securecleaning.au`
   - `www.securecleaning.au`
4. Set `securecleaning.com.au` as the primary production domain.
5. Configure redirects:
   - `www.securecleaning.com.au` -> `https://securecleaning.com.au`
   - `securecleaning.au` -> `https://securecleaning.com.au`
   - `www.securecleaning.au` -> `https://securecleaning.com.au`
6. Confirm the production environment variable `NEXT_PUBLIC_SITE_URL` is `https://securecleaning.com.au`.
7. Redeploy production after the domain and env changes are saved.

## DNS / registrar steps
1. At the registrar or DNS provider for `securecleaning.com.au`, add the records Vercel shows for the apex domain.
2. Add the `www.securecleaning.com.au` record Vercel provides.
3. For `securecleaning.au`, either:
   - point the domain to Vercel and use Vercel domain redirects, or
   - use the registrar's URL forwarding feature to send all traffic to `https://securecleaning.com.au`
4. If using registrar forwarding, choose a permanent redirect and enable path forwarding if the registrar supports it.

## Post-cutover checks
- `https://securecleaning.com.au` loads as the final URL
- `https://www.securecleaning.com.au` lands on `https://securecleaning.com.au`
- `https://securecleaning.au` lands on `https://securecleaning.com.au`
- `https://www.securecleaning.au` lands on `https://securecleaning.com.au`
- `/robots.txt` references `https://securecleaning.com.au/sitemap.xml`
- `/sitemap.xml` contains only `https://securecleaning.com.au/...` URLs
- Quote and booking emails link back to `https://securecleaning.com.au`
- Search Console and analytics use the `.com.au` property as primary

## Recommended follow-up
- Add both domains to Google Search Console, then set the `.com.au` property as the one you monitor going forward
- Resubmit the sitemap from the `.com.au` domain after launch
- Keep the `.au` redirect in place long-term to preserve backlinks and typed-in traffic
