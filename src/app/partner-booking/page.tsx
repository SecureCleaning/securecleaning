import type { Metadata } from 'next'
import PartnerBookingPortal from '@/components/partner/PartnerBookingPortal'
export const metadata: Metadata = { title: 'Partner booking | Secure Cleaning', robots: { index: false, follow: false, noarchive: true } }
export default function PartnerBookingPage() { return <PartnerBookingPortal /> }
