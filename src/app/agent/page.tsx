import type { Metadata } from 'next'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Agent Portal Login | Secure Cleaning Aus',
  description: 'Secure login for Secure Cleaning regional agents.',
}

export default function AgentPortalPage() {
  return (
    <AvailabilityAgentLogin
      defaultUsername=""
      title="Secure Cleaning Agent Portal"
      description="Sign in to manage your client visits, availability, quotes, and regional cleaner database."
      submitLabel="Open agent portal"
    />
  )
}
