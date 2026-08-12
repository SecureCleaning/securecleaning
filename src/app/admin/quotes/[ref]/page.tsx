import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import QuoteWorkflowEditor from '@/components/admin/QuoteWorkflowEditor'
import { withAdminPage } from '@/lib/adminPage'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export const dynamic = 'force-dynamic'

export default async function AdminQuoteWorkflowPage({ params }: { params: { ref: string } }) {
  return withAdminPage(async () => {
    const pricingConfig = await getQuotePricingConfig()
    const roomTypeConfig = await getQuoteRoomTypeConfig()
    const quote = await getQuoteWorkflowByRef(params.ref, roomTypeConfig)

    if (!quote) {
      return (
        <div className="min-h-screen bg-gray-50 py-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>
              Quote workflow not found
            </h1>
            <p className="text-gray-600 mb-8">
              We couldn&apos;t load that remote quote. Check the reference and try again from the admin dashboard.
            </p>
            <AdminNav currentPath="/admin" />
            <Link
              href="/admin"
              className="inline-flex items-center rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to admin
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>
                Quote Workbench
              </h1>
              <p className="text-gray-600 max-w-3xl">
                Start from the original remote quote, complete the inspection worksheet, then refine the inputs and client-facing scope into a firmer quotation.
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <div className="font-mono font-semibold text-gray-700">{quote.quoteRef}</div>
              <div>Status: <span className="capitalize">{quote.status}</span></div>
            </div>
          </div>

          <AdminNav currentPath="/admin" />
          <QuoteWorkflowEditor quote={quote} pricingConfig={pricingConfig} roomTypeConfig={roomTypeConfig} />
        </div>
      </div>
    )
  }, 'Admin login required', 'Unlock admin access to edit inspection worksheets and firm quote drafts.')
}
