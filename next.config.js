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
}

module.exports = nextConfig
