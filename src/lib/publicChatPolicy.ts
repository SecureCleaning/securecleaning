// Fail closed for new routes: capability links and portals must never embed a provider.
const PUBLIC_CHAT_PATHS = new Set([
  '/', '/about', '/services', '/faq', '/contact', '/privacy', '/terms',
  '/cities', '/cities/melbourne', '/cities/sydney', '/cleaners', '/consumables',
])

export function allowsPublicChat(pathname: string | null): boolean {
  return pathname !== null && PUBLIC_CHAT_PATHS.has(pathname)
}

export function getRobofyFrameUrl(projectId?: string, chatbotId?: string): string | null {
  if (!projectId || !chatbotId) return null
  const identifier = /^[A-Za-z0-9_-]{1,200}$/
  if (!identifier.test(projectId) || !identifier.test(chatbotId)) return null
  const url = new URL('https://agents.robofy.ai/agent-widget')
  url.searchParams.set('pid', projectId)
  url.searchParams.set('cid', chatbotId)
  return url.toString()
}
