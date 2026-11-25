import { getAdminSupabase } from '@/lib/supabase'
import { cleanerMatchReasons, type CleanerMatch } from '@/lib/cleanerDuplicateReview'

export async function findCleanerMatches(draft: Record<string, unknown>, state?: string): Promise<CleanerMatch[]> {
  const matches: CleanerMatch[] = []
  for (let offset = 0; ; offset += 500) {
    let query = getAdminSupabase().from('cleaners').select('id,first_name,last_name,contact_name,email,phone,alternate_phone').order('id').range(offset, offset + 499)
    if (state) query = query.eq('state', state)
    const { data, error } = await query
    if (error) throw new Error('Unable to check existing cleaners. Please try again.')
    for (const row of data ?? []) {
      const reasons = cleanerMatchReasons(draft, row)
      if (reasons.length) matches.push({ id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.contact_name || 'Cleaner', email: row.email, phone: row.phone, reasons })
    }
    if ((data ?? []).length < 500) break
  }
  return matches.sort((a,b) => Number(b.reasons.includes('Email')) - Number(a.reasons.includes('Email')) || b.reasons.length-a.reasons.length || a.name.localeCompare(b.name))
}
