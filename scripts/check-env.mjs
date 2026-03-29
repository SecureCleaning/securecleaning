const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONTENT_ADMIN_PASSWORD',
  'RESEND_API_KEY',
  'FROM_EMAIL',
  'ADMIN_EMAIL',
  'NEXT_PUBLIC_SITE_URL',
]

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error('Missing required environment variables:')
  for (const key of missing) console.error(`- ${key}`)
  process.exit(1)
}

console.log('Environment check passed.')
