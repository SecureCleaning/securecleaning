/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
  swcMinify: false,
  images: {
    domains: [],
  },
  async redirects() {
    return [
      // Keep older admin bookmarks working after the admin area was consolidated.
      { source: '/admin/quotes', destination: '/admin', permanent: false },
      { source: '/admin/bookings', destination: '/admin', permanent: false },
      { source: '/admin/clients', destination: '/admin', permanent: false },
      { source: '/admin/site', destination: '/admin/sites', permanent: false },
      { source: '/admin/contents', destination: '/admin/content', permanent: false },
      { source: '/admin/prices', destination: '/admin/pricing', permanent: false },
      { source: '/admin/roomtypes', destination: '/admin/room-types', permanent: false },
      { source: '/admin/cleaner', destination: '/admin/cleaners', permanent: false },
    ]
  },
}

module.exports = nextConfig
