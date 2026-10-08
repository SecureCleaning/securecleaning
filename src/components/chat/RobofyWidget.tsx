'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { allowsPublicChat, getRobofyFrameUrl } from '@/lib/publicChatPolicy'

function IsolatedRobofyChat({ src }: { src: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <section aria-label="Secure Cleaning chat" className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl" style={{ width: 'min(380px, calc(100vw - 32px))' }}>
          <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
            <span className="font-semibold">Secure Cleaning chat</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Close</button>
          </div>
          {/* This URL must remain on the fixed vendor origin. Storage is available
              only to that origin; no vendor script runs in the application window. */}
          <iframe
            id="secure-cleaning-robofy-chat"
            title="Secure Cleaning assistant"
            src={src}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
            className="block w-full border-0"
            style={{ height: 'min(560px, calc(100dvh - 180px))' }}
          />
        </section>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? 'secure-cleaning-robofy-chat' : undefined}
        onClick={() => setOpen(value => !value)}
        className="ml-auto block rounded-full bg-navy px-5 py-3 font-semibold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        {open ? 'Close chat' : 'Chat with Secure Cleaning'}
      </button>
    </div>
  )
}

export default function RobofyWidget() {
  const pathname = usePathname()
  const src = getRobofyFrameUrl(process.env.NEXT_PUBLIC_ROBOFY_PID, process.env.NEXT_PUBLIC_ROBOFY_CID)
  if (!allowsPublicChat(pathname) || !src) return null

  // Route changes destroy the isolated browsing context, including its timers.
  return <IsolatedRobofyChat key={pathname} src={src} />
}
