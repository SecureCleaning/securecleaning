import AdminPageHeader from '@/components/admin/AdminPageHeader'
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
        <div>
          <AdminPageHeader title="Quote workflow not found" description="We couldn&apos;t load that remote quote. Check the reference and try again from the admin dashboard." />
        </div>
      )
    }

    return (
      <div>
          <AdminPageHeader
            title="Quote Workbench"
            description="Start from the original remote quote, complete the inspection worksheet, then refine the inputs and client-facing scope into a firmer quotation."
            meta={<div className="text-right text-sm text-gray-500"><div className="font-mono font-semibold text-gray-700">{quote.quoteRef}</div><div>Status: <span className="capitalize">{quote.status}</span></div></div>}
          />
          <QuoteWorkflowEditor quote={quote} pricingConfig={pricingConfig} roomTypeConfig={roomTypeConfig} />
      </div>
    )
  }, 'Admin login required', 'Unlock admin access to edit inspection worksheets and firm quote drafts.')
}
