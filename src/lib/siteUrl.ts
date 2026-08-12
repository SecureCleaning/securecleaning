const DEFAULT_SITE_URL = 'https://securecleaning.com.au'

export const LEGACY_SITE_HOSTS = new Set([
  'securecleaning.au',
  'www.securecleaning.au',
  'www.securecleaning.com.au',
])

function normalizeSiteUrl(candidate?: string | null) {
  if (!candidate) return DEFAULT_SITE_URL

  try {
    const url = new URL(candidate)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_SITE_URL
  }
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
}

export function getCanonicalSiteUrl() {
  return new URL(getSiteUrl())
}
