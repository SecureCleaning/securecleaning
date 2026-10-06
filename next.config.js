/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@anthropic-ai/sdk'],
  images: {
    domains: [],
  },
  async redirects() {
    return [
      // Keep older admin bookmarks working after the admin area was consolidated.
      { source: '/admin/quotes', destination: '/admin', permanent: false },
      { source: '/admin/bookings', destination: '/admin', permanent: false },
      { source: '/admin/site', destination: '/admin/sites', permanent: false },
      { source: '/admin/contents', destination: '/admin/content', permanent: false },
      { source: '/admin/prices', destination: '/admin/pricing', permanent: false },
      { source: '/admin/roomtypes', destination: '/admin/room-types', permanent: false },
      { source: '/admin/cleaner', destination: '/admin/cleaners', permanent: false },
    ]
  },
  async headers() {
    return [
      ...['/admin/:path*', '/availability/:path*', '/quote/:path*', '/scope/:path*', '/api/quote/:path*', '/booking/:path*'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store' }] })),
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/availability/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ]
  },
}

module.exports = nextConfig
