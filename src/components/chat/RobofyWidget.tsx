import Script from 'next/script'

export default function RobofyWidget() {
  const projectId = process.env.NEXT_PUBLIC_ROBOFY_PID
  const chatbotId = process.env.NEXT_PUBLIC_ROBOFY_CID

  if (!projectId || !chatbotId) return null

  return (
    <Script
      id="secure-cleaning-robofy-agent"
      src="https://agents.robofy.ai/embed/agent-widget.js"
      data-pid={projectId}
      data-cid={chatbotId}
      strategy="afterInteractive"
    />
  )
}
