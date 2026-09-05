import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminPricingPage() {
  redirect('/admin/room-types')
}
