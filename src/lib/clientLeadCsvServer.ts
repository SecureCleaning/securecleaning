import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { ClientCrmError, createManualCrmOpportunity, prepareManualCrmOpportunity } from '@/lib/clientCrmData'
import { getPremisesCatalog } from '@/lib/premisesCatalogServer'
import { LEAD_CSV_COLUMNS, leadCsv, parseLeadCsv, partitionLeadCsvRows } from '@/lib/clientLeadCsv'

export async function previewLeadCsv(actor: ClientCrmActor, text: string) {
  let rows: ReturnType<typeof parseLeadCsv>
  try { rows = parseLeadCsv(text, await getPremisesCatalog()) } catch (error) { throw new ClientCrmError((error as Error).message) }
  for (const row of rows) {
    if (row.errors.length) continue
    try {
      await prepareManualCrmOpportunity(actor, row.input)
      const key = createHash('sha256').update(JSON.stringify(LEAD_CSV_COLUMNS.map(key => row.record[key] || ''))).digest('hex')
      const prior = await getAdminSupabase().from('crm_lead_import_rows').select('opportunity_id').eq('actor_id', actor.id).eq('import_key', key).maybeSingle()
      if (prior.error) throw prior.error
      if (!prior.data) {
        const contacts = await getAdminSupabase().rpc('find_client_crm_contacts_by_email', { p_email: row.record.email })
        if (contacts.error) throw contacts.error
        if (contacts.data?.length) row.errors.push('This email already exists. Review the existing client record before importing a new lead.')
      }
    } catch (error) {
      if (!(error instanceof ClientCrmError)) throw error
      row.errors.push(error.message)
    }
  }
  return rows
}
export async function importLeadCsv(actor: ClientCrmActor, text: string, excludedRows: number[] = []) {
  const rows = await previewLeadCsv(actor, text)
  const selection = partitionLeadCsvRows(rows, excludedRows)
  if (!selection.included.length) throw new ClientCrmError('Select at least one valid row to import.')
  if (selection.included.some(row => row.errors.length)) throw new ClientCrmError('Exclude or correct all remaining preview errors before importing.')
  const results: { row: number; id?: string; error?: string; excluded?: boolean }[] = selection.excluded.map(row => ({ row: row.row, excluded: true }))
  for (const row of selection.included) {
    const key = createHash('sha256').update(JSON.stringify(LEAD_CSV_COLUMNS.map(key => row.record[key] || ''))).digest('hex')
    try {
      const result = await createManualCrmOpportunity(actor, row.input, key)
      results.push({ row: row.row, id: result.id })
    } catch (error) {
      if (!(error instanceof ClientCrmError)) {
        // Stop on infrastructure errors: completed rows are safe to retry through the import ledger.
        results.push({ row: row.row, error: 'Import interrupted. Earlier successful rows are saved. Retry this CSV safely.' })
        break
      }
      results.push({ row: row.row, error: error.message })
    }
  }
  return results.sort((a, b) => a.row - b.row)
}
export async function exportLeadCsv(actor: ClientCrmActor) {
  const db = getAdminSupabase(); const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 200) {
    let query = db.from('crm_opportunities').select('id,primary_contact_id,organisation_id,site_id,notes').order('id').range(offset, offset + 199)
    if (actor.role === 'agent') query = query.eq('assigned_staff_id', actor.id)
    const { data, error } = await query
    if (error) throw error
    const opportunities = data ?? []
    if (!opportunities.length) break
    const ids = (key: 'primary_contact_id' | 'organisation_id' | 'site_id') => [...new Set(opportunities.map(row => row[key]).filter(Boolean))]
    const [contacts, organisations, sites, links] = await Promise.all([
      db.from('clients').select('id,business_name,first_name,last_name,email,phone,city').in('id', ids('primary_contact_id')),
      db.from('crm_organisations').select('id,business_name').in('id', ids('organisation_id')),
      db.from('sites').select('id,address,suburb,postcode,city,premises_type,premises_type_other').in('id', ids('site_id')),
      db.from('crm_opportunity_intakes').select('opportunity_id,lead_id,linked_at').in('opportunity_id', opportunities.map(row => row.id)).order('linked_at'),
    ])
    for (const result of [contacts, organisations, sites, links]) if (result.error) throw result.error
    const { data: leads, error: leadError } = await db.from('leads').select('id,source,source_provider,source_reference,contact_basis').in('id', (links.data ?? []).map(row => row.lead_id))
    if (leadError) throw leadError
    for (const opportunity of opportunities) {
      const contact = contacts.data?.find(row => row.id === opportunity.primary_contact_id)
      const organisation = organisations.data?.find(row => row.id === opportunity.organisation_id)
      const site = sites.data?.find(row => row.id === opportunity.site_id)
      const leadId = links.data?.find(row => row.opportunity_id === opportunity.id)?.lead_id
      const lead = leads?.find(row => row.id === leadId)
      rows.push({ ...contact, ...site, notes: opportunity.notes, business_name: organisation?.business_name || contact?.business_name, city: site?.city || contact?.city,
        source_type: lead?.source || 'manual', contact_basis: lead?.contact_basis || '', source_provider: lead?.source_provider || '', source_reference: lead?.source_reference || '' })
    }
    if (opportunities.length < 200) break
  }
  return leadCsv(rows)
}

