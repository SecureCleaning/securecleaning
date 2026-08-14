import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { getAdminSessionIdentityFromCookies, hasAdminRole } from '@/lib/adminAuth'
import { getRobofyInboxSessions } from '@/lib/robofyInbox'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function AdminChatPage() {
  return withAdminPage(async () => {
    const identity = await getAdminSessionIdentityFromCookies()
    if (!identity || !hasAdminRole(identity.role, 'viewer')) {
      return (
        <div>
          <AdminPageHeader title="Chat Inbox" description="Chat inbox access requires an active admin role." />
        </div>
      )
    }

    const inbox = await getRobofyInboxSessions()

    return (
      <div>
          <AdminPageHeader title="Chat Inbox" description="Review recent conversations from the Secure Cleaning website chatbot. Continue sensitive conversations inside Robofy." />

          {!inbox.configured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Robofy inbox is not configured yet. The public chatbot can still operate, but the server-only API key and chatbot ID are required for this view.
            </div>
          ) : inbox.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {inbox.error}
            </div>
          ) : (
            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Recent Robofy conversations</h2>
                  <p className="text-sm text-gray-500">{inbox.sessions.length} conversation{inbox.sessions.length === 1 ? '' : 's'} returned</p>
                </div>
                <a
                  href="https://agents.robofy.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  Open Robofy inbox
                </a>
              </div>

              {inbox.sessions.length === 0 ? (
                <div className="px-6 py-10 text-sm text-gray-500">No Robofy conversations found yet.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {inbox.sessions.map((session) => (
                    <article key={session.sessionId} className="px-6 py-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900">
                            {session.visitorName ?? 'Website visitor'}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(session.lastMessageTime)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {session.lastMessageDirection ?? 'conversation'}
                        </span>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {session.lastMessage ?? 'No message preview available.'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
      </div>
    )
  })
}
