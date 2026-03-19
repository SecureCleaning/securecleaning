import { supabase, getAdminSupabase } from '@/lib/supabase'

export type ContentEntryDefinition = {
  key: string
  title: string
  content: string
  group_name: string
}

export type ContentMap = Record<string, string>

export const CONTENT_DEFAULTS: ContentEntryDefinition[] = [
  {
    key: 'home.hero_title',
    title: 'Homepage hero title',
    content: 'Professional Commercial Cleaning for Melbourne & Sydney Businesses',
    group_name: 'home',
  },
  {
    key: 'home.hero_subtitle',
    title: 'Homepage hero subtitle',
    content:
      'Verified Owner-Operators. Transparent pricing. No lock-in contracts. Get an instant online quote and book your first clean today.',
    group_name: 'home',
  },
  {
    key: 'home.cta_primary_label',
    title: 'Homepage primary CTA label',
    content: 'Get an Instant Quote →',
    group_name: 'home',
  },
  {
    key: 'home.cta_secondary_label',
    title: 'Homepage secondary CTA label',
    content: 'View Services',
    group_name: 'home',
  },
  {
    key: 'home.why_title',
    title: 'Homepage why section heading',
    content: 'Why Secure Cleaning Aus?',
    group_name: 'home',
  },
  {
    key: 'contact.email',
    title: 'Contact email address',
    content: 'info@securecleaning.au',
    group_name: 'contact',
  },
  {
    key: 'contact.phone',
    title: 'Contact phone number',
    content: '1300 000 000',
    group_name: 'contact',
  },
  {
    key: 'contact.service_areas',
    title: 'Contact service areas',
    content: 'Melbourne & Sydney, Australia',
    group_name: 'contact',
  },
  {
    key: 'about.intro',
    title: 'About page intro paragraph',
    content:
      'Secure Cleaning Aus is a trading name of Secure Contracts Pty Ltd, an Australian company focused on delivering professional commercial cleaning services to businesses in Melbourne and Sydney through our Owner-Operator network.',
    group_name: 'about',
  },
  {
    key: 'faq.heading',
    title: 'FAQ page heading',
    content: 'Frequently Asked Questions',
    group_name: 'faq',
  },
]

export type SiteContentRow = ContentEntryDefinition & {
  updated_at?: string | null
}

const DEFAULT_CONTENT_MAP = CONTENT_DEFAULTS.reduce<ContentMap>((acc, entry) => {
  acc[entry.key] = entry.content
  return acc
}, {})

export function getContentValue(map: ContentMap | null | undefined, key: string, fallback: string) {
  return map?.[key] || fallback
}

export async function getPublicContentMap(): Promise<ContentMap> {
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('key, content')

    if (error || !data) {
      if (error) {
        console.error('[content] Failed to load public content:', error)
      }
      return { ...DEFAULT_CONTENT_MAP }
    }

    return data.reduce<ContentMap>((acc, row) => {
      acc[row.key] = row.content
      return acc
    }, { ...DEFAULT_CONTENT_MAP })
  } catch (error) {
    console.error('[content] Unexpected error loading public content:', error)
    return { ...DEFAULT_CONTENT_MAP }
  }
}

export async function getAllContentEntries(): Promise<SiteContentRow[]> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('site_content')
      .select('key, title, content, group_name, updated_at')
      .order('group_name', { ascending: true })
      .order('title', { ascending: true })

    if (error || !data) {
      if (error) {
        console.error('[content] Failed to load admin content:', error)
      }
      return CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))
    }

    const rowsByKey = new Map(data.map((row) => [row.key, row]))

    return CONTENT_DEFAULTS.map((entry) => rowsByKey.get(entry.key) ?? { ...entry, updated_at: null })
  } catch (error) {
    console.error('[content] Unexpected error loading admin content:', error)
    return CONTENT_DEFAULTS.map((entry) => ({ ...entry, updated_at: null }))
  }
}

export async function upsertContentEntries(entries: ContentEntryDefinition[]) {
  const db = getAdminSupabase()

  const payload = entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    content: entry.content,
    group_name: entry.group_name,
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await db
    .from('site_content')
    .upsert(payload, { onConflict: 'key' })
    .select('key, title, content, group_name, updated_at')

  if (error) {
    throw error
  }

  return data ?? []
}
