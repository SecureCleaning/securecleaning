import Link from 'next/link'

export type PartnerCleanerIntake = {
  id: string; company_id: string; user_id: string; created_at: string; created_cleaner: boolean;
  email_status: string; review_reason: string | null;
  inputs: { businessName: string; firstName: string; lastName: string; email: string; phone: string; suburb: string; postcode: string; state: string; notes: string }
}

export default function PartnerCleanerIntakes({ items, companies, users }: {
  items: PartnerCleanerIntake[]; companies: { id: string; name: string }[]; users: { id: string; display_name: string }[]
}) {
  return <section className="space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-bold">Recent partner cleaner leads</h2>
    <p className="text-sm text-gray-600">Latest 100 submissions. New cleaners are saved as leads. Existing email matches and email delivery issues need review. Check Resend before sending another secure link from the Cleaner Database.</p>
    <Link className="inline-block font-semibold text-teal-700 underline" href="/admin/cleaners">Open Cleaner Database</Link>
    {!items.length && <p>No cleaner leads submitted yet.</p>}
    {items.map(item => <article key={item.id} className="space-y-2 rounded-lg border p-4">
      <p className="font-bold">{item.inputs.businessName}</p>
      <p className="text-sm">{companies.find(c => c.id === item.company_id)?.name} · {users.find(u => u.id === item.user_id)?.display_name} · {new Date(item.created_at).toLocaleString('en-AU')}</p>
      <p className="break-words">{item.inputs.firstName} {item.inputs.lastName} · {item.inputs.email} · {item.inputs.phone}<br />{item.inputs.suburb} {item.inputs.postcode}, {item.inputs.state}</p>
      <p>{item.created_cleaner ? 'New cleaner lead recorded' : 'Existing email match - details held for review'} · Email: <strong>{item.email_status.replaceAll('_', ' ')}</strong></p>
      {item.email_status !== 'sent' && <p className="font-semibold text-amber-800">{item.review_reason || 'Invitation is queued or processing. Check delivery before resending.'}</p>}
      {item.inputs.notes && <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm"><strong>Internal call notes:</strong> {item.inputs.notes}</p>}
    </article>)}
  </section>
}
